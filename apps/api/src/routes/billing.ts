import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { tenants } from "../db/schema/tenants.js";
import { planPayments } from "../db/schema/billing.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";
import { PLAN_PRICES } from "@qyne/shared";
import type { PlanTier } from "@qyne/shared";

export const billingRoutes = new Hono<AppEnv>();

billingRoutes.use("*", authMiddleware, tenantMiddleware);

// --- Schemas ---

const upgradeRequestSchema = z.object({
  requestedTier: z.enum(["starter", "pro", "business"]),
  method: z.enum(["pago_movil", "zelle", "binance"]),
  screenshotUrl: z.string().min(10).max(5000).optional(),
  reference: z.string().max(255).optional(),
});

// --- Routes ---

/**
 * GET /billing/plan — Get current plan info for the tenant.
 * Includes tier, expiration, and payment history.
 */
billingRoutes.get("/plan", async (c) => {
  const tenantId = c.get("tenantId")!;
  const db = getDb();

  const [tenant] = await db
    .select({
      planTier: tenants.planTier,
      planExpiresAt: tenants.planExpiresAt,
      aiImagesUsed: tenants.aiImagesUsed,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  // Auto-downgrade check.
  let effectiveTier = (tenant?.planTier ?? "free") as PlanTier;
  if (effectiveTier !== "free" && tenant?.planExpiresAt) {
    if (Date.now() >= new Date(tenant.planExpiresAt).getTime()) {
      await db
        .update(tenants)
        .set({ planTier: "free", planExpiresAt: null })
        .where(eq(tenants.id, tenantId));
      effectiveTier = "free";
    }
  }

  const recentPayments = await db
    .select()
    .from(planPayments)
    .where(eq(planPayments.tenantId, tenantId))
    .orderBy(desc(planPayments.createdAt))
    .limit(10);

  return c.json({
    data: {
      currentTier: effectiveTier,
      expiresAt: effectiveTier !== "free" ? tenant?.planExpiresAt : null,
      aiImagesUsed: tenant?.aiImagesUsed ?? 0,
      prices: PLAN_PRICES,
      payments: recentPayments,
    },
  });
});

/**
 * POST /billing/upgrade — Request a plan upgrade.
 * Merchant submits payment proof (screenshot). Admin verifies later.
 */
billingRoutes.post("/upgrade", zValidator("json", upgradeRequestSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const body = c.req.valid("json");
  const db = getDb();

  const price = PLAN_PRICES[body.requestedTier as PlanTier];

  const [payment] = await db
    .insert(planPayments)
    .values({
      tenantId,
      requestedTier: body.requestedTier,
      amount: String(price),
      method: body.method,
      screenshotUrl: body.screenshotUrl ?? null,
      reference: body.reference ?? null,
      status: "pending",
    })
    .returning();

  return c.json({ data: payment }, 201);
});

/**
 * POST /billing/admin/activate — Admin endpoint to activate a plan.
 * Requires X-Admin-Secret header (not Clerk session).
 *
 * Body: { tenantId, tier, daysActive?, paymentId? }
 */
billingRoutes.post(
  "/admin/activate",
  zValidator(
    "json",
    z.object({
      tenantId: z.string().uuid(),
      tier: z.enum(["free", "starter", "pro", "business"]),
      daysActive: z.number().int().min(1).max(365).default(30),
      paymentId: z.string().uuid().optional(),
    }),
  ),
  async (c) => {
    // Simple admin auth via secret header.
    const adminSecret = c.req.header("X-Admin-Secret");
    const expectedSecret = process.env.ADMIN_SECRET;
    if (!expectedSecret || adminSecret !== expectedSecret) {
      return c.json({ error: { message: "Unauthorized", status: 401 } }, 401);
    }

    const { tenantId, tier, daysActive, paymentId } = c.req.valid("json");
    const db = getDb();

    // Calculate expiration.
    const expiresAt =
      tier === "free" ? null : new Date(Date.now() + daysActive * 24 * 60 * 60 * 1000);

    // Update tenant plan.
    await db
      .update(tenants)
      .set({
        planTier: tier,
        planExpiresAt: expiresAt,
        aiImagesUsed: 0, // Reset usage on plan change.
      })
      .where(eq(tenants.id, tenantId));

    // Mark payment as verified if provided.
    if (paymentId) {
      await db
        .update(planPayments)
        .set({
          status: "verified",
          verifiedBy: "admin",
          verifiedAt: new Date(),
        })
        .where(eq(planPayments.id, paymentId));
    }

    return c.json({
      data: {
        tenantId,
        tier,
        expiresAt,
        daysActive,
        message:
          tier === "free"
            ? "Plan downgraded to free"
            : `Plan activated: ${tier} for ${daysActive} days`,
      },
    });
  },
);

/**
 * GET /billing/admin/pending — List all pending upgrade requests (admin).
 */
billingRoutes.get("/admin/pending", async (c) => {
  const adminSecret = c.req.header("X-Admin-Secret");
  const expectedSecret = process.env.ADMIN_SECRET;
  if (!expectedSecret || adminSecret !== expectedSecret) {
    return c.json({ error: { message: "Unauthorized", status: 401 } }, 401);
  }

  const db = getDb();
  const pending = await db
    .select({
      id: planPayments.id,
      tenantId: planPayments.tenantId,
      requestedTier: planPayments.requestedTier,
      amount: planPayments.amount,
      method: planPayments.method,
      screenshotUrl: planPayments.screenshotUrl,
      reference: planPayments.reference,
      createdAt: planPayments.createdAt,
    })
    .from(planPayments)
    .where(eq(planPayments.status, "pending"))
    .orderBy(desc(planPayments.createdAt))
    .limit(50);

  return c.json({ data: pending });
});

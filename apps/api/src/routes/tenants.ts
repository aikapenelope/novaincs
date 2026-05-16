import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { tenants, tenantMembers } from "../db/schema/index.js";
import { authMiddleware } from "../middleware/auth.js";

export const tenantRoutes = new Hono<AppEnv>();

// All tenant routes require authentication.
tenantRoutes.use("*", authMiddleware);

// --- Schemas ---

const createTenantSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
});

const updateTenantSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(500).nullish(),
  settings: z.record(z.unknown()).optional(),
});

// --- Routes ---

/**
 * POST /tenants — Create a new tenant (merchant account).
 * Called during onboarding after Clerk signup.
 * The authenticated user becomes the tenant owner.
 */
tenantRoutes.post("/", zValidator("json", createTenantSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ error: { message: "Authentication required", status: 401 } }, 401);
  }

  const body = c.req.valid("json");
  const db = getDb();

  // Check if slug is already taken.
  const existing = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, body.slug))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: { message: "Slug already taken", status: 409 } }, 409);
  }

  // Create tenant + owner membership in a single transaction.
  const result = await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: body.name,
        slug: body.slug,
        ownerUserId: userId,
      })
      .returning();

    await tx.insert(tenantMembers).values({
      tenantId: tenant.id,
      userId: userId,
      role: "owner",
    });

    return tenant;
  });

  return c.json({ data: result }, 201);
});

/**
 * GET /tenants/me — Get the current user's tenant(s).
 * Returns all tenants the authenticated user is a member of.
 */
tenantRoutes.get("/me", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ error: { message: "Authentication required", status: 401 } }, 401);
  }

  const db = getDb();

  const memberships = await db
    .select({
      tenantId: tenantMembers.tenantId,
      role: tenantMembers.role,
      tenant: {
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        planTier: tenants.planTier,
        status: tenants.status,
        createdAt: tenants.createdAt,
      },
    })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
    .where(eq(tenantMembers.userId, userId));

  return c.json({ data: memberships });
});

/**
 * GET /tenants/:id — Get a specific tenant by ID.
 * Requires the user to be a member of the tenant.
 */
tenantRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ error: { message: "Authentication required", status: 401 } }, 401);
  }

  const tenantId = c.req.param("id");
  const db = getDb();

  // Verify membership.
  const membership = await db
    .select()
    .from(tenantMembers)
    .where(eq(tenantMembers.tenantId, tenantId))
    .limit(1);

  const isMember = membership.some((m) => m.userId === userId);
  if (!isMember) {
    return c.json({ error: { message: "Not found", status: 404 } }, 404);
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);

  if (!tenant) {
    return c.json({ error: { message: "Not found", status: 404 } }, 404);
  }

  return c.json({ data: tenant });
});

/**
 * PATCH /tenants/:id — Update tenant settings.
 * Only the owner can update the tenant.
 */
tenantRoutes.patch("/:id", zValidator("json", updateTenantSchema), async (c) => {
  const userId = c.get("userId");
  if (!userId) {
    return c.json({ error: { message: "Authentication required", status: 401 } }, 401);
  }

  const tenantId = c.req.param("id");
  const body = c.req.valid("json");
  const db = getDb();

  // Verify ownership.
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);

  if (!tenant || tenant.ownerUserId !== userId) {
    return c.json({ error: { message: "Not found or not authorized", status: 404 } }, 404);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.settings !== undefined) updates.settings = body.settings;

  const [updated] = await db
    .update(tenants)
    .set(updates)
    .where(eq(tenants.id, tenantId))
    .returning();

  return c.json({ data: updated });
});

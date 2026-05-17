import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { payments, orders } from "../db/schema/orders.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";
import { enqueuePaymentOcr } from "../services/payment-ocr.js";

export const paymentRoutes = new Hono<AppEnv>();

paymentRoutes.use("*", authMiddleware, tenantMiddleware);

// --- Schemas ---

const uploadScreenshotSchema = z.object({
  orderId: z.string().uuid(),
  method: z.enum(["pago_movil", "zelle"]),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.enum(["USD", "VES"]).default("USD"),
  screenshotUrl: z.string().url(),
  notes: z.string().max(500).nullish(),
});

const verifyPaymentSchema = z.object({
  status: z.enum(["verified", "rejected"]),
  notes: z.string().max(500).nullish(),
});

// --- Routes ---

/**
 * POST /payments — Submit a payment screenshot for an order.
 *
 * Called after the buyer uploads a screenshot via /uploads/image.
 * Creates a payment record and updates the order status.
 *
 * Flow:
 * 1. Buyer pays via Pago Movil or Zelle (outside the app)
 * 2. Buyer uploads screenshot via /uploads/image (gets URL back)
 * 3. Buyer/system calls POST /payments with the screenshot URL
 * 4. Order status moves to "screenshot_uploaded"
 * 5. Merchant reviews and verifies/rejects via PATCH /payments/:id/verify
 */
paymentRoutes.post("/", zValidator("json", uploadScreenshotSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const body = c.req.valid("json");
  const db = getDb();

  // Verify the order exists and belongs to this tenant.
  const [order] = await db
    .select({ id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus })
    .from(orders)
    .where(and(eq(orders.id, body.orderId), eq(orders.tenantId, tenantId)))
    .limit(1);

  if (!order) {
    return c.json({ error: { message: "Order not found", status: 404 } }, 404);
  }

  // Only allow payment submission for orders in valid states.
  const allowedStatuses = ["payment_pending", "rejected"];
  if (!allowedStatuses.includes(order.status)) {
    return c.json(
      {
        error: {
          message: `Cannot submit payment for order in status: ${order.status}`,
          status: 400,
        },
      },
      400,
    );
  }

  const result = await db.transaction(async (tx) => {
    // Create payment record.
    const [payment] = await tx
      .insert(payments)
      .values({
        tenantId,
        orderId: body.orderId,
        method: body.method,
        amount: body.amount,
        currency: body.currency,
        status: "screenshot_uploaded",
        screenshotUrl: body.screenshotUrl,
        notes: body.notes ?? null,
      })
      .returning();

    // Update order status.
    await tx
      .update(orders)
      .set({
        status: "screenshot_uploaded",
        paymentStatus: "screenshot_uploaded",
        paymentScreenshotUrl: body.screenshotUrl,
      })
      .where(eq(orders.id, body.orderId));

    return payment;
  });

  // Trigger async OCR on the screenshot via the Finance Agent.
  enqueuePaymentOcr({
    paymentId: result.id,
    orderId: body.orderId,
    tenantId,
    screenshotUrl: body.screenshotUrl,
    expectedAmount: body.amount,
    expectedCurrency: body.currency,
  });

  return c.json({ data: result }, 201);
});

/**
 * GET /payments — List payments for the current tenant.
 * Optionally filtered by orderId or status.
 */
paymentRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId")!;
  const orderId = c.req.query("orderId");
  const status = c.req.query("status");
  const db = getDb();

  const conditions = [eq(payments.tenantId, tenantId)];
  if (orderId) conditions.push(eq(payments.orderId, orderId));
  if (status) conditions.push(eq(payments.status, status));

  const rows = await db
    .select()
    .from(payments)
    .where(and(...conditions))
    .orderBy(payments.createdAt);

  return c.json({ data: rows });
});

/**
 * GET /payments/:id — Get a single payment with its order context.
 */
paymentRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const paymentId = c.req.param("id");
  const db = getDb();

  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.tenantId, tenantId)))
    .limit(1);

  if (!payment) {
    return c.json({ error: { message: "Payment not found", status: 404 } }, 404);
  }

  // Fetch the associated order for context.
  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      buyerName: orders.buyerName,
      totalUsd: orders.totalUsd,
      status: orders.status,
    })
    .from(orders)
    .where(eq(orders.id, payment.orderId))
    .limit(1);

  return c.json({ data: { ...payment, order } });
});

/**
 * GET /payments/:id/ocr — Get the OCR result for a payment screenshot.
 *
 * Returns the Finance Agent's extraction: amount, reference, bank, date,
 * confidence level, and whether it matches the expected order total.
 * Used by the dashboard to show the merchant what the AI extracted
 * before they verify/reject.
 */
paymentRoutes.get("/:id/ocr", async (c) => {
  const tenantId = c.get("tenantId")!;
  const paymentId = c.req.param("id");
  const db = getDb();

  const [payment] = await db
    .select({
      id: payments.id,
      status: payments.status,
      ocrData: payments.ocrData,
      screenshotUrl: payments.screenshotUrl,
      amount: payments.amount,
      currency: payments.currency,
    })
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.tenantId, tenantId)))
    .limit(1);

  if (!payment) {
    return c.json({ error: { message: "Payment not found", status: 404 } }, 404);
  }

  return c.json({
    data: {
      paymentId: payment.id,
      status: payment.status,
      screenshotUrl: payment.screenshotUrl,
      expectedAmount: payment.amount,
      expectedCurrency: payment.currency,
      ocr: payment.ocrData ?? null,
    },
  });
});

/**
 * PATCH /payments/:id/verify — Verify or reject a payment.
 *
 * This is the merchant's action after reviewing the screenshot.
 * - "verified": payment confirmed, order moves to "verified" status
 * - "rejected": payment rejected, order moves back to "rejected" (buyer can retry)
 *
 * In Phase 2, the Finance Agent will do OCR on the screenshot and
 * auto-verify when the extracted amount matches the order total.
 */
paymentRoutes.patch("/:id/verify", zValidator("json", verifyPaymentSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const paymentId = c.req.param("id");
  const userId = c.get("userId")!;
  const body = c.req.valid("json");
  const db = getDb();

  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.tenantId, tenantId)))
    .limit(1);

  if (!payment) {
    return c.json({ error: { message: "Payment not found", status: 404 } }, 404);
  }

  // Only allow verification of payments in screenshot_uploaded or verifying state.
  if (!["screenshot_uploaded", "verifying"].includes(payment.status)) {
    return c.json(
      {
        error: {
          message: `Cannot verify payment in status: ${payment.status}`,
          status: 400,
        },
      },
      400,
    );
  }

  const result = await db.transaction(async (tx) => {
    // Update payment record.
    const [updated] = await tx
      .update(payments)
      .set({
        status: body.status,
        verifiedAt: body.status === "verified" ? new Date() : null,
        verifiedBy: body.status === "verified" ? userId : null,
        notes: body.notes ?? payment.notes,
      })
      .where(eq(payments.id, paymentId))
      .returning();

    // Update order status based on verification result.
    if (body.status === "verified") {
      await tx
        .update(orders)
        .set({
          status: "verified",
          paymentStatus: "verified",
          expiresAt: null, // Clear stock reservation — payment confirmed.
        })
        .where(eq(orders.id, payment.orderId));
    } else if (body.status === "rejected") {
      await tx
        .update(orders)
        .set({
          status: "rejected",
          paymentStatus: "rejected",
        })
        .where(eq(orders.id, payment.orderId));
    }

    return updated;
  });

  return c.json({ data: result });
});

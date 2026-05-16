import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { paymentConfigs } from "../db/schema/tenants.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";

/**
 * Payment config routes — merchant manages their payment methods.
 * These are the bank details shown to buyers during checkout.
 */
export const paymentConfigRoutes = new Hono<AppEnv>();

paymentConfigRoutes.use("*", authMiddleware, tenantMiddleware);

const upsertSchema = z.object({
  method: z.enum(["pago_movil", "zelle", "cash_on_delivery"]),
  label: z.string().max(100).nullish(),
  details: z.record(z.string()).default({}),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

/**
 * GET /payment-configs — List all payment configs for the tenant.
 */
paymentConfigRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId")!;
  const db = getDb();

  const configs = await db
    .select()
    .from(paymentConfigs)
    .where(eq(paymentConfigs.tenantId, tenantId))
    .orderBy(paymentConfigs.sortOrder);

  return c.json({ data: configs });
});

/**
 * POST /payment-configs — Create a new payment config.
 */
paymentConfigRoutes.post("/", zValidator("json", upsertSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const body = c.req.valid("json");
  const db = getDb();

  const [config] = await db
    .insert(paymentConfigs)
    .values({
      tenantId,
      method: body.method,
      label: body.label ?? null,
      details: body.details,
      isActive: body.isActive,
      sortOrder: body.sortOrder,
    })
    .returning();

  return c.json({ data: config }, 201);
});

/**
 * PATCH /payment-configs/:id — Update a payment config.
 */
paymentConfigRoutes.patch("/:id", zValidator("json", upsertSchema.partial()), async (c) => {
  const tenantId = c.get("tenantId")!;
  const configId = c.req.param("id");
  const body = c.req.valid("json");
  const db = getDb();

  const updates: Record<string, unknown> = {};
  if (body.method !== undefined) updates.method = body.method;
  if (body.label !== undefined) updates.label = body.label;
  if (body.details !== undefined) updates.details = body.details;
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: { message: "No fields to update", status: 400 } }, 400);
  }

  const [updated] = await db
    .update(paymentConfigs)
    .set(updates)
    .where(and(eq(paymentConfigs.id, configId), eq(paymentConfigs.tenantId, tenantId)))
    .returning();

  if (!updated) {
    return c.json({ error: { message: "Payment config not found", status: 404 } }, 404);
  }

  return c.json({ data: updated });
});

/**
 * DELETE /payment-configs/:id — Delete a payment config.
 */
paymentConfigRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const configId = c.req.param("id");
  const db = getDb();

  const [deleted] = await db
    .delete(paymentConfigs)
    .where(and(eq(paymentConfigs.id, configId), eq(paymentConfigs.tenantId, tenantId)))
    .returning({ id: paymentConfigs.id });

  if (!deleted) {
    return c.json({ error: { message: "Payment config not found", status: 404 } }, 404);
  }

  return c.json({ data: { id: deleted.id, deleted: true } });
});

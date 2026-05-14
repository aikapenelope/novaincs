import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { inventoryMovements } from "../db/schema/inventory.js";
import { products, productVariants } from "../db/schema/products.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";

export const inventoryRoutes = new Hono<AppEnv>();

inventoryRoutes.use("*", authMiddleware, tenantMiddleware);

// --- Schemas ---

const adjustStockSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullish(),
  // Positive = stock in, negative = stock out.
  quantity: z
    .number()
    .int()
    .refine((n) => n !== 0, "Quantity cannot be zero"),
  reason: z.enum(["manual_adjustment", "restock", "damaged", "returned", "count_correction"]),
  notes: z.string().max(500).nullish(),
});

const listMovementsSchema = z.object({
  productId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// --- Routes ---

/**
 * POST /inventory/adjust — Adjust stock for a product or variant.
 *
 * Creates an inventory movement record and updates the product/variant stock.
 * Prevents stock from going negative.
 */
inventoryRoutes.post("/adjust", zValidator("json", adjustStockSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const body = c.req.valid("json");
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    if (body.variantId) {
      // Adjust variant stock.
      const [variant] = await tx
        .select({ stock: productVariants.stock })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.id, body.variantId),
            eq(productVariants.productId, body.productId),
            eq(productVariants.tenantId, tenantId),
          ),
        )
        .limit(1);

      if (!variant) {
        return { error: "Variant not found" };
      }

      const newStock = variant.stock + body.quantity;
      if (newStock < 0) {
        return {
          error: `Insufficient stock: ${variant.stock} available, adjustment of ${body.quantity} would result in ${newStock}`,
        };
      }

      await tx
        .update(productVariants)
        .set({ stock: newStock })
        .where(eq(productVariants.id, body.variantId));

      // Recalculate parent product stock.
      const stockResult = await tx
        .select({ total: sql<number>`COALESCE(SUM(${productVariants.stock}), 0)` })
        .from(productVariants)
        .where(
          and(eq(productVariants.productId, body.productId), eq(productVariants.status, "active")),
        );

      await tx
        .update(products)
        .set({ stock: Number(stockResult[0]?.total ?? 0) })
        .where(eq(products.id, body.productId));
    } else {
      // Adjust product stock directly.
      const [product] = await tx
        .select({ stock: products.stock })
        .from(products)
        .where(and(eq(products.id, body.productId), eq(products.tenantId, tenantId)))
        .limit(1);

      if (!product) {
        return { error: "Product not found" };
      }

      const newStock = product.stock + body.quantity;
      if (newStock < 0) {
        return {
          error: `Insufficient stock: ${product.stock} available, adjustment of ${body.quantity} would result in ${newStock}`,
        };
      }

      await tx.update(products).set({ stock: newStock }).where(eq(products.id, body.productId));
    }

    // Record the movement.
    const [movement] = await tx
      .insert(inventoryMovements)
      .values({
        tenantId,
        productId: body.productId,
        quantity: body.quantity,
        reason: body.reason,
        notes: body.notes ?? null,
      })
      .returning();

    return { data: movement };
  });

  if ("error" in result) {
    return c.json({ error: { message: result.error, status: 400 } }, 400);
  }

  return c.json({ data: result.data }, 201);
});

/**
 * GET /inventory/movements — List inventory movements.
 * Optionally filtered by productId.
 */
inventoryRoutes.get("/movements", zValidator("query", listMovementsSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const query = c.req.valid("query");
  const db = getDb();

  const conditions = [eq(inventoryMovements.tenantId, tenantId)];
  if (query.productId) conditions.push(eq(inventoryMovements.productId, query.productId));

  const rows = await db
    .select()
    .from(inventoryMovements)
    .where(and(...conditions))
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  return c.json({ data: rows });
});

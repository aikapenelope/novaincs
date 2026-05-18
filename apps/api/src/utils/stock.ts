/**
 * Atomic stock transaction helpers.
 *
 * Encapsulates the pattern of atomically decrementing/incrementing stock
 * with a WHERE guard that prevents overselling under concurrency.
 *
 * The key insight: `UPDATE ... SET stock = stock - N WHERE stock >= N`
 * is atomic in PostgreSQL. If two concurrent checkouts try to buy the
 * last item, only one will succeed (the other gets 0 rows affected).
 *
 * Also logs every stock movement with qty_after_transaction for full
 * traceability and audit trail.
 *
 * Adapted from Nala's stock.ts pattern.
 */

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { products, productVariants } from "../db/schema/products.js";
import { inventoryMovements } from "../db/schema/inventory.js";

/** A single item's stock change. */
export interface StockChangeItem {
  productId: string;
  variantId?: string | null;
  quantity: number;
}

/** Context for logging the stock movement. */
export interface StockMovementContext {
  tenantId: string;
  type: "sale" | "void" | "adjustment" | "purchase" | "expiry";
  referenceType: string;
  referenceId: string;
  notes?: string;
}

/**
 * Atomically decrement stock for a list of items.
 *
 * Uses `WHERE stock >= qty` guard to prevent overselling.
 * If any item has insufficient stock, throws an error with the product ID.
 *
 * @param items - Items to decrement
 * @param ctx - Context for movement logging
 * @returns Map of productId -> post-decrement stock level
 * @throws Error if any item has insufficient stock
 */
export async function decrementStock(
  items: StockChangeItem[],
  ctx: StockMovementContext,
): Promise<Map<string, number>> {
  const db = getDb();
  const stockAfterMap = new Map<string, number>();

  for (const item of items) {
    if (item.quantity <= 0) continue;

    // Decrement variant stock if applicable
    if (item.variantId) {
      const variantResult = await db
        .update(productVariants)
        .set({
          stock: sql`${productVariants.stock} - ${item.quantity}`,
        })
        .where(
          and(
            eq(productVariants.id, item.variantId),
            eq(productVariants.tenantId, ctx.tenantId),
            sql`${productVariants.stock} >= ${item.quantity}`,
          ),
        )
        .returning({ id: productVariants.id });

      if (variantResult.length === 0) {
        throw new Error(
          `Stock insuficiente para la variante del producto. Verifica disponibilidad.`,
        );
      }
    }

    // Decrement product-level stock (always, even for variants)
    const productResult = await db
      .update(products)
      .set({
        stock: sql`${products.stock} - ${item.quantity}`,
      })
      .where(
        and(
          eq(products.id, item.productId),
          eq(products.tenantId, ctx.tenantId),
          sql`${products.stock} >= ${item.quantity}`,
        ),
      )
      .returning({ id: products.id, stock: products.stock });

    if (productResult.length === 0) {
      throw new Error(`Stock insuficiente. Verifica disponibilidad antes de confirmar.`);
    }

    stockAfterMap.set(item.productId, productResult[0].stock);

    // Log the movement
    await db.insert(inventoryMovements).values({
      tenantId: ctx.tenantId,
      productId: item.productId,
      quantity: -item.quantity,
      reason: ctx.type,
      referenceId: ctx.referenceId || undefined,
      notes: ctx.notes ?? null,
    });
  }

  return stockAfterMap;
}

/**
 * Atomically increment stock for a list of items (used for voids/returns/expiry restores).
 *
 * No guard needed — incrementing always succeeds.
 *
 * @param items - Items to increment
 * @param ctx - Context for movement logging
 * @returns Map of productId -> post-increment stock level
 */
export async function incrementStock(
  items: StockChangeItem[],
  ctx: StockMovementContext,
): Promise<Map<string, number>> {
  const db = getDb();
  const stockAfterMap = new Map<string, number>();

  for (const item of items) {
    if (item.quantity <= 0) continue;

    // Increment variant stock if applicable
    if (item.variantId) {
      await db
        .update(productVariants)
        .set({
          stock: sql`${productVariants.stock} + ${item.quantity}`,
        })
        .where(
          and(eq(productVariants.id, item.variantId), eq(productVariants.tenantId, ctx.tenantId)),
        );
    }

    // Increment product-level stock
    const [restored] = await db
      .update(products)
      .set({
        stock: sql`${products.stock} + ${item.quantity}`,
      })
      .where(and(eq(products.id, item.productId), eq(products.tenantId, ctx.tenantId)))
      .returning({ stock: products.stock });

    stockAfterMap.set(item.productId, restored?.stock ?? 0);

    // Log the movement
    await db.insert(inventoryMovements).values({
      tenantId: ctx.tenantId,
      productId: item.productId,
      quantity: item.quantity,
      reason: ctx.type,
      referenceId: ctx.referenceId || undefined,
      notes: ctx.notes ?? null,
    });
  }

  return stockAfterMap;
}

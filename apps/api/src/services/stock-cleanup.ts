/**
 * Expired stock reservation cleanup.
 *
 * Orders with `expiresAt` in the past and status "payment_pending" have
 * reserved stock that was never paid for. This worker releases that stock
 * and marks the orders as "expired".
 *
 * Runs as a BullMQ repeatable job every 15 minutes. If Redis is unavailable,
 * the worker is not started (graceful degradation — same pattern as image-queue).
 *
 * Can also be called directly via `releaseExpiredReservations()` for testing
 * or one-off cleanup.
 */

import { Queue, Worker } from "bullmq";
import { eq, and, lt, isNotNull, sql, inArray } from "drizzle-orm";
import { getRedisConnection } from "./redis.js";
import { getDb } from "../db/index.js";
import { orders, orderItems } from "../db/schema/orders.js";
import { products, productVariants } from "../db/schema/products.js";
import { inventoryMovements } from "../db/schema/inventory.js";
import { notifyOrderExpired } from "./notification-service.js";

const QUEUE_NAME = "stock-cleanup";

let _queue: Queue | null = null;
let _worker: Worker | null = null;

/**
 * Release stock for all expired, unpaid orders.
 *
 * For each expired order:
 *   1. Restore stock on products/variants
 *   2. Record inventory movements (reason: "reservation_expired")
 *   3. Mark order status as "expired"
 *
 * Returns the number of orders cleaned up.
 */
export async function releaseExpiredReservations(): Promise<number> {
  const db = getDb();
  const now = new Date();

  // Find expired orders that still have reserved stock.
  // Only orders in "payment_pending" or "created" status should be cleaned up.
  // Orders that already have a screenshot uploaded are being reviewed — don't expire those.
  const expiredOrders = await db
    .select({ id: orders.id, tenantId: orders.tenantId, orderNumber: orders.orderNumber })
    .from(orders)
    .where(
      and(
        isNotNull(orders.expiresAt),
        lt(orders.expiresAt, now),
        inArray(orders.status, ["payment_pending", "created"]),
      ),
    )
    .limit(100); // Process in batches to avoid long transactions.

  if (expiredOrders.length === 0) return 0;

  let cleaned = 0;

  for (const order of expiredOrders) {
    try {
      await db.transaction(async (tx) => {
        // Fetch order items to know what stock to release.
        const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));

        // Restore stock for each item.
        for (const item of items) {
          if (item.variantId) {
            await tx
              .update(productVariants)
              .set({ stock: sql`${productVariants.stock} + ${item.quantity}` })
              .where(eq(productVariants.id, item.variantId));
          } else if (item.productId) {
            await tx
              .update(products)
              .set({ stock: sql`${products.stock} + ${item.quantity}` })
              .where(eq(products.id, item.productId));
          }

          // Record the inventory movement.
          if (item.productId) {
            await tx.insert(inventoryMovements).values({
              tenantId: order.tenantId,
              productId: item.productId,
              quantity: item.quantity,
              reason: "reservation_expired",
              referenceId: order.id,
            });
          }
        }

        // Mark order as expired.
        await tx
          .update(orders)
          .set({
            status: "expired",
            paymentStatus: "expired",
            expiresAt: null,
          })
          .where(eq(orders.id, order.id));
      });

      // Notify merchant about expired order (fire-and-forget).
      void notifyOrderExpired(order.tenantId, order.orderNumber, order.id);

      cleaned++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[stock-cleanup] Failed to expire order ${order.id}: ${message}`);
    }
  }

  if (cleaned > 0) {
    console.log(`[stock-cleanup] Released stock for ${cleaned} expired orders`);
  }

  return cleaned;
}

/**
 * Start the stock cleanup worker.
 * Schedules a repeatable job every 15 minutes.
 * Call once at server startup.
 */
export function startStockCleanupWorker(): void {
  const redis = getRedisConnection();
  if (!redis) {
    console.warn("[stock-cleanup] Redis unavailable, worker not started");
    return;
  }

  _queue = new Queue(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  });

  // Add repeatable job (idempotent — BullMQ deduplicates by repeat key).
  void _queue.add(
    "cleanup",
    {},
    {
      repeat: {
        every: 15 * 60 * 1000, // 15 minutes
      },
    },
  );

  _worker = new Worker(
    QUEUE_NAME,
    async () => {
      await releaseExpiredReservations();
    },
    {
      connection: redis,
      concurrency: 1,
    },
  );

  _worker.on("failed", (_job, err) => {
    console.error(`[stock-cleanup] Job failed: ${err.message}`);
  });

  console.log("[stock-cleanup] Worker started (every 15 min)");
}

/**
 * Gracefully shut down the stock cleanup worker.
 */
export async function stopStockCleanupWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}

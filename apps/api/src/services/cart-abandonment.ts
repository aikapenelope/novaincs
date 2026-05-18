/**
 * Cart abandonment detection worker.
 *
 * Detects visitors who added items to cart but didn't complete checkout
 * within 2 hours. Creates a `cart_abandoned` event in customer_events
 * so the merchant can see it in the CRM timeline and (in future sprints)
 * trigger automated recovery messages.
 *
 * How it works:
 *   1. Runs every 30 minutes via BullMQ cron
 *   2. Finds `add_to_cart` events from 2-24 hours ago
 *   3. For each, checks if the same visitor/customer completed checkout
 *   4. If not, creates a `cart_abandoned` event (once per visitor per day)
 *
 * The 2h window gives buyers time to complete Pago Movil transfers
 * (which require switching to a banking app and back). The 24h upper
 * bound prevents re-flagging old carts.
 */

import { Queue, Worker } from "bullmq";
import { and, eq, gte, lte } from "drizzle-orm";
import { getRedisConnection } from "./redis.js";
import { getDb } from "../db/index.js";
import { customerEvents } from "../db/schema/customers.js";

const QUEUE_NAME = "cart-abandonment";
const ABANDONMENT_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24 hours

let _queue: Queue | null = null;
let _worker: Worker | null = null;

/**
 * Detect abandoned carts and create events.
 * Returns the number of abandonment events created.
 */
export async function detectAbandonedCarts(): Promise<number> {
  const db = getDb();
  const now = new Date();
  const windowStart = new Date(now.getTime() - MAX_LOOKBACK_MS);
  const windowEnd = new Date(now.getTime() - ABANDONMENT_WINDOW_MS);

  // Find all add_to_cart events in the detection window (2h-24h ago).
  // Group by tenant + actor (visitor or customer) to avoid duplicates.
  const cartEvents = await db
    .select({
      tenantId: customerEvents.tenantId,
      actorId: customerEvents.actorId,
      customerId: customerEvents.customerId,
      entityId: customerEvents.entityId,
    })
    .from(customerEvents)
    .where(
      and(
        eq(customerEvents.eventType, "add_to_cart"),
        gte(customerEvents.createdAt, windowStart),
        lte(customerEvents.createdAt, windowEnd),
      ),
    )
    .limit(500);

  if (cartEvents.length === 0) return 0;

  // Deduplicate by tenant + actorId (one abandonment per visitor per run).
  const seen = new Set<string>();
  const uniqueCarts: typeof cartEvents = [];
  for (const event of cartEvents) {
    const key = `${event.tenantId}:${event.actorId ?? event.customerId ?? "unknown"}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueCarts.push(event);
    }
  }

  let created = 0;

  for (const cart of uniqueCarts) {
    const actorKey = cart.actorId ?? cart.customerId;
    if (!actorKey) continue;

    // Check if this visitor/customer completed checkout after the add_to_cart.
    const [completed] = await db
      .select({ id: customerEvents.id })
      .from(customerEvents)
      .where(
        and(
          eq(customerEvents.tenantId, cart.tenantId),
          eq(customerEvents.eventType, "checkout_complete"),
          gte(customerEvents.createdAt, windowStart),
          cart.actorId
            ? eq(customerEvents.actorId, cart.actorId)
            : eq(customerEvents.customerId, cart.customerId!),
        ),
      )
      .limit(1);

    if (completed) continue; // They completed checkout — not abandoned.

    // Check if we already created an abandonment event for this visitor today.
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [existing] = await db
      .select({ id: customerEvents.id })
      .from(customerEvents)
      .where(
        and(
          eq(customerEvents.tenantId, cart.tenantId),
          eq(customerEvents.eventType, "cart_abandoned"),
          gte(customerEvents.createdAt, todayStart),
          cart.actorId
            ? eq(customerEvents.actorId, cart.actorId)
            : eq(customerEvents.customerId, cart.customerId!),
        ),
      )
      .limit(1);

    if (existing) continue; // Already flagged today.

    // Create the cart_abandoned event.
    await db.insert(customerEvents).values({
      tenantId: cart.tenantId,
      customerId: cart.customerId,
      eventType: "cart_abandoned",
      entityType: "product",
      entityId: cart.entityId,
      actorType: "system",
      actorId: cart.actorId,
      data: {
        detectedAt: now.toISOString(),
        windowHours: ABANDONMENT_WINDOW_MS / (60 * 60 * 1000),
      },
      metadata: {},
    });

    created++;
  }

  if (created > 0) {
    console.log(`[cart-abandonment] Detected ${created} abandoned carts`);
  }

  return created;
}

/**
 * Start the cart abandonment detection worker.
 * Runs every 30 minutes.
 */
export function startCartAbandonmentWorker(): void {
  const redis = getRedisConnection();
  if (!redis) {
    console.warn("[cart-abandonment] Redis unavailable, worker not started");
    return;
  }

  _queue = new Queue(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  });

  // Schedule repeatable job every 30 minutes.
  _queue.add("detect", {}, { repeat: { every: 30 * 60 * 1000 } }).catch(() => {});

  _worker = new Worker(
    QUEUE_NAME,
    async () => {
      await detectAbandonedCarts();
    },
    {
      connection: redis,
      concurrency: 1,
    },
  );

  _worker.on("failed", (_job, err) => {
    console.error(`[cart-abandonment] Job failed: ${err.message}`);
  });

  console.log("[cart-abandonment] Worker started (every 30 min)");
}

/**
 * Gracefully shut down the cart abandonment worker.
 */
export async function stopCartAbandonmentWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}

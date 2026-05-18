/**
 * BullMQ worker for behavioral event ingestion.
 *
 * Events arrive from the beacon API and are queued in Redis.
 * This worker batch-inserts them into the customer_events table
 * in PostgreSQL every few seconds, keeping the beacon response
 * fast and reducing database write pressure.
 *
 * Architecture:
 *   Catalog PWA → POST /beacon → Redis queue → this worker → PostgreSQL
 */

import { Queue, Worker } from "bullmq";
import { getRedisConnection } from "./redis.js";
import { getDb } from "../db/index.js";
import { customerEvents } from "../db/schema/customers.js";

const QUEUE_NAME = "behavioral-events";

let _queue: Queue | null = null;
let _worker: Worker | null = null;

export interface BeaconEvent {
  tenantId: string;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  actorType: string;
  actorId: string | null;
  customerId: string | null;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

/**
 * Enqueue a behavioral event for async processing.
 * Returns true if the event was queued, false if Redis is unavailable.
 */
export function enqueueEvent(event: BeaconEvent): boolean {
  if (!_queue) return false;

  // Fire-and-forget: don't await the queue add.
  _queue
    .add("event", event, {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    })
    .catch(() => {});

  return true;
}

/**
 * Start the behavioral event worker.
 * Processes events one at a time with low concurrency to avoid
 * overwhelming the database with writes.
 */
export function startEventWorker(): void {
  const redis = getRedisConnection();
  if (!redis) {
    console.warn("[event-worker] Redis unavailable, worker not started");
    return;
  }

  _queue = new Queue(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  _worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const event = job.data as BeaconEvent;
      const db = getDb();

      await db.insert(customerEvents).values({
        tenantId: event.tenantId,
        customerId: event.customerId,
        eventType: event.eventType,
        entityType: event.entityType,
        entityId: event.entityId,
        actorType: event.actorType,
        actorId: event.actorId,
        data: event.data,
        metadata: event.metadata,
      });
    },
    {
      connection: redis,
      concurrency: 3, // Process up to 3 events concurrently
    },
  );

  _worker.on("failed", (job, err) => {
    console.error(`[event-worker] Job ${job?.id} failed: ${err.message}`);
  });

  console.log("[event-worker] Worker started (concurrency: 3)");
}

/**
 * Gracefully shut down the event worker.
 */
export async function stopEventWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}

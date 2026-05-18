/**
 * Shared BullMQ worker lifecycle utilities.
 *
 * Extracts the common pattern used by all cron workers:
 *   1. Get Redis connection (skip if unavailable)
 *   2. Create Queue with standard job options
 *   3. Schedule a repeatable job
 *   4. Create a Worker that processes jobs
 *
 * This eliminates duplication across cart-abandonment, feed-generator,
 * stock-cleanup, rfm-scoring, exchange-rate-worker, and daily-briefing.
 */

import { Queue, Worker } from "bullmq";
import { getRedisConnection } from "./redis.js";

export interface CronWorkerConfig {
  /** Queue name (e.g., "cart-abandonment"). */
  name: string;
  /** Job name within the queue (e.g., "detect"). */
  jobName: string;
  /** Repeat interval in milliseconds, or cron pattern string. */
  schedule: number | string;
  /** Function to execute on each job. */
  processor: () => Promise<void>;
  /** Worker concurrency (default: 1). */
  concurrency?: number;
}

export interface CronWorkerHandle {
  queue: Queue;
  worker: Worker;
}

/**
 * Create and start a cron-based BullMQ worker.
 * Returns null if Redis is unavailable (graceful degradation).
 */
export function startCronWorker(config: CronWorkerConfig): CronWorkerHandle | null {
  const redis = getRedisConnection();
  if (!redis) {
    console.warn(`[${config.name}] Redis unavailable, worker not started`);
    return null;
  }

  const queue = new Queue(config.name, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  });

  const repeat =
    typeof config.schedule === "number" ? { every: config.schedule } : { pattern: config.schedule };

  queue.add(config.jobName, {}, { repeat }).catch(() => {});

  const worker = new Worker(
    config.name,
    async () => {
      await config.processor();
    },
    {
      connection: redis,
      concurrency: config.concurrency ?? 1,
    },
  );

  worker.on("failed", (_job, err) => {
    console.error(`[${config.name}] Job failed: ${err.message}`);
  });

  console.log(`[${config.name}] Worker started`);

  return { queue, worker };
}

/**
 * Gracefully shut down a cron worker.
 */
export async function stopCronWorker(handle: CronWorkerHandle | null): Promise<void> {
  if (!handle) return;
  await handle.worker.close();
  await handle.queue.close();
}

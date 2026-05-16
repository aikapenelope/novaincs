/**
 * BullMQ worker for periodic BCV exchange rate refresh.
 *
 * Runs every 15 minutes. Fetches the official USD/VES rate from
 * ve.dolarapi.com and stores it in the exchange_rates table.
 *
 * Also performs an initial fetch on startup so the rate is available
 * immediately without waiting for the first scheduled run.
 */

import { Queue, Worker } from "bullmq";
import { getRedisConnection } from "./redis.js";
import { fetchAndStoreRate } from "./exchange-rate.js";

const QUEUE_NAME = "exchange-rate";

let _queue: Queue | null = null;
let _worker: Worker | null = null;

/**
 * Start the exchange rate worker.
 * Fetches immediately on startup, then every 15 minutes.
 */
export function startExchangeRateWorker(): void {
  const redis = getRedisConnection();
  if (!redis) {
    console.warn("[exchange-rate-worker] Redis unavailable, worker not started");
    return;
  }

  _queue = new Queue(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  });

  // Schedule repeatable job every 15 minutes.
  void _queue.add("refresh", {}, { repeat: { every: 15 * 60 * 1000 } });

  // Fetch immediately on startup (don't block server start).
  void fetchAndStoreRate();

  _worker = new Worker(
    QUEUE_NAME,
    async () => {
      await fetchAndStoreRate();
    },
    {
      connection: redis,
      concurrency: 1,
    },
  );

  _worker.on("failed", (_job, err) => {
    console.error(`[exchange-rate-worker] Job failed: ${err.message}`);
  });

  console.log("[exchange-rate-worker] Worker started (every 15 min)");
}

/**
 * Gracefully shut down the exchange rate worker.
 */
export async function stopExchangeRateWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}

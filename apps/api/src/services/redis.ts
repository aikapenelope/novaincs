/**
 * Redis connection for BullMQ queues.
 *
 * Uses ioredis (required by BullMQ). Parses REDIS_URL for host, port, password.
 * Returns null if REDIS_URL is not configured (queues disabled in dev without Redis).
 */

import IORedis from "ioredis";

let _redis: IORedis | null = null;

export function getRedisConnection(): IORedis | null {
  if (_redis) return _redis;

  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("[redis] REDIS_URL not set. BullMQ queues disabled.");
    return null;
  }

  _redis = new IORedis(url, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
  });

  _redis.on("error", (err) => {
    console.error("[redis] Connection error:", err.message);
  });

  return _redis;
}

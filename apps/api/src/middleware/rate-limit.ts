import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { getRedisConnection } from "../services/redis.js";

/**
 * Redis-backed sliding-window rate limiter.
 *
 * Uses Redis INCR + EXPIRE for atomic, distributed rate limiting.
 * Falls back to in-memory Map when Redis is unavailable (dev without Redis).
 *
 * Rate limits are per-IP using X-Forwarded-For (from Traefik/Cloudflare).
 *
 * @param windowMs - Time window in milliseconds (default: 60_000 = 1 minute)
 * @param maxRequests - Maximum requests per window per IP (default: 100)
 */
export function rateLimiter(options: { windowMs?: number; maxRequests?: number } = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const windowSec = Math.ceil(windowMs / 1000);
  const maxRequests = options.maxRequests ?? 100;

  // In-memory fallback for dev environments without Redis.
  const memoryStore = new Map<string, { count: number; resetAt: number }>();
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of memoryStore) {
      if (now >= entry.resetAt) {
        memoryStore.delete(key);
      }
    }
  }, windowMs * 2);
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return createMiddleware(async (c, next) => {
    // Use X-Forwarded-For (from Traefik/Cloudflare) or fall back to direct IP.
    const forwarded = c.req.header("X-Forwarded-For");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

    const redis = getRedisConnection();

    let count: number;
    let resetAt: number;

    if (redis) {
      // Redis-backed rate limiting using INCR + EXPIRE.
      // Key format: rl:{ip}:{window} where window is the current time bucket.
      const bucket = Math.floor(Date.now() / windowMs);
      const key = `rl:${ip}:${bucket}`;

      // INCR is atomic — first call creates the key with value 1.
      count = await redis.incr(key);

      // Set TTL only on first increment (when count is 1) to avoid resetting it.
      if (count === 1) {
        await redis.expire(key, windowSec + 1); // +1s buffer for clock skew
      }

      resetAt = (bucket + 1) * windowMs;
    } else {
      // In-memory fallback (dev only).
      const now = Date.now();
      let entry = memoryStore.get(ip);

      if (!entry || now >= entry.resetAt) {
        entry = { count: 0, resetAt: now + windowMs };
        memoryStore.set(ip, entry);
      }

      entry.count++;
      count = entry.count;
      resetAt = entry.resetAt;
    }

    // Set rate limit headers.
    c.header("X-RateLimit-Limit", String(maxRequests));
    c.header("X-RateLimit-Remaining", String(Math.max(0, maxRequests - count)));
    c.header("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

    if (count > maxRequests) {
      c.header("Retry-After", String(Math.ceil((resetAt - Date.now()) / 1000)));
      throw new HTTPException(429, { message: "Too many requests" });
    }

    await next();
  });
}

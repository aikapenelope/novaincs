import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

/**
 * Simple in-memory sliding-window rate limiter.
 *
 * Limits requests per IP address. Uses an in-memory Map, so limits reset
 * on server restart. For production with multiple instances, replace with
 * a Redis-backed implementation.
 *
 * @param windowMs - Time window in milliseconds (default: 60_000 = 1 minute)
 * @param maxRequests - Maximum requests per window per IP (default: 100)
 */
export function rateLimiter(options: { windowMs?: number; maxRequests?: number } = {}) {
  const windowMs = options.windowMs ?? 60_000;
  const maxRequests = options.maxRequests ?? 100;

  // Map<ip, { count, resetAt }>
  const store = new Map<string, { count: number; resetAt: number }>();

  // Periodically clean expired entries to prevent memory leaks.
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) {
        store.delete(key);
      }
    }
  }, windowMs * 2);

  // Allow garbage collection of the interval if the module is unloaded.
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return createMiddleware(async (c, next) => {
    // Use X-Forwarded-For (from Traefik) or fall back to direct IP.
    const forwarded = c.req.header("X-Forwarded-For");
    const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";

    const now = Date.now();
    let entry = store.get(ip);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(ip, entry);
    }

    entry.count++;

    // Set rate limit headers.
    c.header("X-RateLimit-Limit", String(maxRequests));
    c.header("X-RateLimit-Remaining", String(Math.max(0, maxRequests - entry.count)));
    c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > maxRequests) {
      c.header("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      throw new HTTPException(429, { message: "Too many requests" });
    }

    await next();
  });
}

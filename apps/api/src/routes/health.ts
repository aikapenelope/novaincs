import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { getRedisConnection } from "../services/redis.js";

export const healthRoutes = new Hono();

/**
 * GET /health — Deep health check.
 *
 * Verifies connectivity to PostgreSQL and Redis. Returns 200 only when
 * all critical dependencies are reachable. Traefik and Coolify use this
 * to decide whether the container is healthy.
 *
 * Response shape:
 *   { status: "ok"|"degraded", service, timestamp, checks: { pg, redis } }
 *
 * Returns 200 when pg is up (Redis is optional in dev).
 * Returns 503 when pg is down.
 */
healthRoutes.get("/health", async (c) => {
  const checks: Record<string, { status: string; latencyMs?: number; error?: string }> = {};

  // --- PostgreSQL ---
  try {
    const start = Date.now();
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    checks.pg = { status: "ok", latencyMs: Date.now() - start };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    checks.pg = { status: "error", error: message };
  }

  // --- Redis ---
  try {
    const redis = getRedisConnection();
    if (redis) {
      const start = Date.now();
      await redis.ping();
      checks.redis = { status: "ok", latencyMs: Date.now() - start };
    } else {
      checks.redis = { status: "unavailable", error: "REDIS_URL not configured" };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    checks.redis = { status: "error", error: message };
  }

  // PostgreSQL is critical — if it's down, the service is unhealthy.
  const pgOk = checks.pg.status === "ok";
  const allOk = pgOk && checks.redis.status === "ok";
  const status = allOk ? "ok" : pgOk ? "degraded" : "error";
  const httpStatus = pgOk ? 200 : 503;

  return c.json(
    {
      status,
      service: "qyne-api",
      timestamp: new Date().toISOString(),
      checks,
    },
    httpStatus,
  );
});

/**
 * Structured JSON logging middleware.
 *
 * Replaces hono/logger with JSON output for production observability.
 * Each log line is a single JSON object with:
 * - method, path, status, ms (request info)
 * - requestId (correlation ID, short hex)
 * - userId, tenantId (when available, post-auth)
 *
 * In production, these JSON lines are parseable by log aggregators
 * (Grafana Loki, Datadog, CloudWatch). In development, the same
 * format works with `jq` for filtering.
 *
 * Adapted from Nala's structured-logger.ts pattern.
 */

import { createMiddleware } from "hono/factory";
import crypto from "node:crypto";
import type { AppEnv } from "../app.js";

/** Generate a short request ID (8 hex chars). */
function shortId(): string {
  return crypto.randomBytes(4).toString("hex");
}

/**
 * Structured logger middleware.
 *
 * Sets X-Request-Id response header for correlation.
 * Logs one JSON line per request on completion.
 *
 * Log levels:
 * - error: 5xx responses
 * - warn: 4xx responses
 * - info: 2xx/3xx responses
 */
export const structuredLogger = createMiddleware<AppEnv>(async (c, next) => {
  const requestId = shortId();
  c.header("X-Request-Id", requestId);

  const start = performance.now();

  await next();

  const ms = Math.round(performance.now() - start);
  const status = c.res.status;
  const method = c.req.method;
  const path = c.req.path;

  // Extract context set by auth/tenant middleware (may be undefined).
  const userId = c.get("userId");
  const tenantId = c.get("tenantId");

  const entry: Record<string, unknown> = {
    level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
    method,
    path,
    status,
    ms,
    requestId,
  };

  if (userId) entry.userId = userId;
  if (tenantId) entry.tenantId = tenantId;

  // Single JSON line to stdout (parseable by log aggregators).
  process.stdout.write(JSON.stringify(entry) + "\n");
});

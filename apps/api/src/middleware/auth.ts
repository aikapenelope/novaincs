import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { verifyToken } from "@clerk/backend";
import type { AppEnv } from "../app.js";

/**
 * Clerk JWT verification middleware.
 *
 * 1. Extracts Bearer token from Authorization header
 * 2. Verifies the JWT with Clerk
 * 3. Stores userId in Hono context
 * 4. Optionally resolves tenantId from X-Tenant-Id header
 *
 * The PostgreSQL RLS session variable is set by handlers via setTenantContext().
 */

function getClerkSecretKey(): string {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) {
    throw new Error("CLERK_SECRET_KEY environment variable is required");
  }
  return key;
}

/**
 * Auth middleware — protects routes that require authentication.
 * Sets `c.get("userId")` on success. Optionally sets `c.get("tenantId")`.
 */
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice(7);

  let userId: string;
  try {
    const payload = await verifyToken(token, {
      secretKey: getClerkSecretKey(),
    });
    userId = payload.sub;
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired token" });
  }

  if (!userId) {
    throw new HTTPException(401, { message: "Token missing subject claim" });
  }

  c.set("userId", userId);

  // Tenant resolution: from X-Tenant-Id header (set by the frontend).
  // In Sprint 4+, this will be validated against the tenant_members table.
  const tenantId = c.req.header("X-Tenant-Id");
  if (tenantId) {
    c.set("tenantId", tenantId);
  }

  await next();
});

/**
 * Tenant context middleware — requires a resolved tenantId.
 * Must be used after authMiddleware on routes that need tenant scoping.
 */
export const tenantMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const tenantId = c.get("tenantId");
  if (!tenantId) {
    throw new HTTPException(400, { message: "Tenant context required (X-Tenant-Id header)" });
  }

  await next();
});

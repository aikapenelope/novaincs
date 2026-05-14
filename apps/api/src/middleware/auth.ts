import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { verifyToken } from "@clerk/backend";
import { eq, and } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { tenantMembers } from "../db/schema/tenants.js";
import { setTenantContext } from "../db/tenant-context.js";

/**
 * Clerk JWT verification middleware.
 *
 * 1. Extracts Bearer token from Authorization header
 * 2. Verifies the JWT with Clerk
 * 3. Stores userId in Hono context
 *
 * Does NOT resolve tenant — use tenantMiddleware for that.
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
 * Sets `c.get("userId")` on success.
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
  await next();
});

/**
 * Tenant context middleware — resolves and validates tenant membership.
 *
 * Must be used after authMiddleware on routes that need tenant scoping.
 *
 * 1. Reads X-Tenant-Id header
 * 2. Validates the authenticated user is a member of that tenant
 * 3. Sets the PostgreSQL session variable for RLS enforcement
 * 4. Stores tenantId and memberRole in Hono context
 *
 * Returns 403 if the user is not a member of the requested tenant.
 * Returns 400 if X-Tenant-Id header is missing.
 */
export const tenantMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const userId = c.get("userId");
  if (!userId) {
    throw new HTTPException(401, { message: "Authentication required" });
  }

  const tenantId = c.req.header("X-Tenant-Id");
  if (!tenantId) {
    throw new HTTPException(400, { message: "X-Tenant-Id header is required" });
  }

  // Validate that this user is actually a member of the requested tenant.
  const db = getDb();
  const [membership] = await db
    .select({ role: tenantMembers.role })
    .from(tenantMembers)
    .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, userId)))
    .limit(1);

  if (!membership) {
    throw new HTTPException(403, { message: "Not a member of this tenant" });
  }

  // Set RLS context so all subsequent queries are scoped to this tenant.
  await setTenantContext(db, tenantId);

  c.set("tenantId", tenantId);
  c.set("memberRole", membership.role);
  await next();
});

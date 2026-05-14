import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

/**
 * Set the PostgreSQL session variable for RLS tenant isolation.
 * Must be called at the start of every request that accesses tenant-scoped data.
 *
 * This sets `app.current_tenant` which is read by the RLS policies
 * defined in 0001_rls_policies.sql.
 */
export async function setTenantContext(db: PostgresJsDatabase, tenantId: string): Promise<void> {
  await db.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);
}

/**
 * Clear the tenant context. Called at the end of a request or on error.
 */
export async function clearTenantContext(db: PostgresJsDatabase): Promise<void> {
  await db.execute(sql`SELECT set_config('app.current_tenant', '', true)`);
}

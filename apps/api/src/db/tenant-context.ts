import { sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

// Use a generic type parameter so this works with any schema type.
type AnyDb = PostgresJsDatabase<Record<string, unknown>>;

/**
 * Set the PostgreSQL session variable for RLS tenant isolation.
 * Must be called at the start of every request that accesses tenant-scoped data.
 *
 * This sets `app.current_tenant` which is read by the RLS policies
 * defined in 0001_rls_policies.sql.
 *
 * The third argument to set_config (true) means "local to transaction".
 * Since postgres.js uses implicit transactions per query, this effectively
 * scopes the setting to the current request when used with connection pooling.
 */
export async function setTenantContext(db: AnyDb, tenantId: string): Promise<void> {
  await db.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`);
}

/**
 * Clear the tenant context. Called at the end of a request or on error.
 */
export async function clearTenantContext(db: AnyDb): Promise<void> {
  await db.execute(sql`SELECT set_config('app.current_tenant', '', true)`);
}

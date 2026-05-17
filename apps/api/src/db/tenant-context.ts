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
 * The third argument to set_config (false) means "session-level" — the setting
 * persists across all queries on this connection until explicitly cleared.
 * This is required because postgres.js wraps each query in its own implicit
 * transaction, so a transaction-local setting (true) would expire before
 * subsequent queries in the same request handler execute.
 *
 * IMPORTANT: Always pair with clearTenantContext() at the end of the request
 * to prevent tenant context from leaking to the next request that reuses
 * this pooled connection.
 */
export async function setTenantContext(db: AnyDb, tenantId: string): Promise<void> {
  await db.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, false)`);
}

/**
 * Clear the tenant context. Must be called at the end of every request
 * (in a finally block) to prevent context leaking across pooled connections.
 */
export async function clearTenantContext(db: AnyDb): Promise<void> {
  await db.execute(sql`SELECT set_config('app.current_tenant', '', false)`);
}

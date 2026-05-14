/**
 * RLS Security Tests
 *
 * These tests verify that PostgreSQL Row-Level Security policies
 * correctly isolate tenant data. They require a running PostgreSQL
 * instance with the schema and RLS policies applied.
 *
 * Run with: DATABASE_URL=postgresql://... pnpm test
 *
 * Strategy:
 *   - Use TWO database connections: one superuser (for setup), one non-superuser (for RLS testing).
 *   - The non-superuser connection simulates the application's runtime behavior.
 *   - RLS is only enforced for non-superuser roles, so we create a dedicated `qyne_app` role.
 *   - If `qyne_app` role doesn't exist (e.g., fresh dev DB), tests create it.
 *
 * Tests verify:
 *   1. Tenant A can see their own data
 *   2. Tenant B CANNOT see tenant A's data (strict zero rows)
 *   3. Tenant B CANNOT insert data with tenant A's ID
 *   4. Context switch changes visible data within the same connection
 *   5. Empty context returns zero rows (fail-closed)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, eq } from "drizzle-orm";
import postgres from "postgres";
import { tenants } from "../db/schema/tenants.js";
import { products } from "../db/schema/products.js";
import { customers } from "../db/schema/customers.js";
import { orders } from "../db/schema/orders.js";

// Skip if no DATABASE_URL is set (CI without DB).
const DATABASE_URL = process.env.DATABASE_URL;
const shouldRun = !!DATABASE_URL;

const APP_ROLE = "qyne_app";

describe.skipIf(!shouldRun)("RLS tenant isolation", () => {
  // Superuser connection — used for setup/teardown only.
  let superSql: ReturnType<typeof postgres>;
  let superDb: ReturnType<typeof drizzle>;

  // App-role connection — simulates the runtime connection with RLS enforced.
  let appSql: ReturnType<typeof postgres>;
  let appDb: ReturnType<typeof drizzle>;

  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    superSql = postgres(DATABASE_URL!, { max: 5 });
    superDb = drizzle(superSql);

    // --- Create the non-superuser app role if it doesn't exist ---
    await superDb.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = ${sql.raw(`'${APP_ROLE}'`)}) THEN
          EXECUTE format('CREATE ROLE %I LOGIN', ${sql.raw(`'${APP_ROLE}'`)});
        END IF;
      END
      $$
    `);

    // Grant the app role access to all tables in public schema.
    await superDb.execute(sql`GRANT USAGE ON SCHEMA public TO ${sql.raw(APP_ROLE)}`);
    await superDb.execute(
      sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${sql.raw(APP_ROLE)}`,
    );
    await superDb.execute(
      sql`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${sql.raw(APP_ROLE)}`,
    );

    // --- Create two test tenants (as superuser, bypasses RLS) ---
    const [tenantA] = await superDb
      .insert(tenants)
      .values({
        name: "RLS Test Tenant A",
        slug: `rls-test-a-${Date.now()}`,
        ownerUserId: "user_rls_test_a",
      })
      .returning();

    const [tenantB] = await superDb
      .insert(tenants)
      .values({
        name: "RLS Test Tenant B",
        slug: `rls-test-b-${Date.now()}`,
        ownerUserId: "user_rls_test_b",
      })
      .returning();

    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    // --- Seed data for tenant A (as superuser) ---
    await superDb.insert(products).values({
      tenantId: tenantAId,
      name: "Secret Product A",
      slug: "secret-product-a",
      stock: 10,
    });

    await superDb.insert(customers).values({
      tenantId: tenantAId,
      name: "Secret Customer A",
      phone: "+584141234567",
    });

    await superDb.insert(orders).values({
      tenantId: tenantAId,
      orderNumber: "ORD-RLS-001",
      buyerName: "Test Buyer A",
      buyerPhone: "+584141234567",
      totalUsd: "100.00",
    });

    // --- Seed data for tenant B (as superuser) ---
    await superDb.insert(products).values({
      tenantId: tenantBId,
      name: "Public Product B",
      slug: "public-product-b",
      stock: 5,
    });

    // --- Open app-role connection (RLS is enforced on this connection) ---
    // Parse the DATABASE_URL to replace the user with the app role.
    const url = new URL(DATABASE_URL!);
    url.username = APP_ROLE;
    url.password = ""; // App role has no password in dev (trust auth or peer)
    // Fallback: if we can't connect as app role, use superuser with SET ROLE.
    try {
      appSql = postgres(url.toString(), { max: 5 });
      appDb = drizzle(appSql);
      // Test the connection
      await appDb.execute(sql`SELECT 1`);
    } catch {
      // Can't connect as app role directly (common in dev with password auth).
      // Use superuser connection but SET ROLE to simulate.
      appSql = postgres(DATABASE_URL!, { max: 1 });
      appDb = drizzle(appSql);
      await appDb.execute(sql`SET ROLE ${sql.raw(APP_ROLE)}`);
    }
  });

  afterAll(async () => {
    // Reset role on app connection before cleanup.
    try {
      await appDb.execute(sql`RESET ROLE`);
    } catch {
      // Ignore if connection is already closed.
    }

    // Clean up test data (as superuser).
    if (tenantAId) {
      await superDb.delete(tenants).where(eq(tenants.id, tenantAId));
    }
    if (tenantBId) {
      await superDb.delete(tenants).where(eq(tenants.id, tenantBId));
    }

    await appSql?.end();
    await superSql?.end();
  });

  /** Set the RLS tenant context on the app-role connection. */
  async function setContext(tenantId: string) {
    await appDb.execute(sql`SELECT set_config('app.current_tenant', ${tenantId}, false)`);
  }

  /** Clear the RLS tenant context. */
  async function clearContext() {
    await appDb.execute(sql`SELECT set_config('app.current_tenant', '', false)`);
  }

  // --- Products ---

  it("tenant A sees their own products", async () => {
    await setContext(tenantAId);
    const rows = await appDb.select().from(products);
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("Secret Product A");
    expect(rows[0].tenantId).toBe(tenantAId);
  });

  it("tenant B sees only their own products, NOT tenant A's", async () => {
    await setContext(tenantBId);
    const rows = await appDb.select().from(products);
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe("Public Product B");
    expect(rows[0].tenantId).toBe(tenantBId);
    // Explicitly verify tenant A's product is NOT visible.
    const leaked = rows.filter((r) => r.tenantId === tenantAId);
    expect(leaked.length).toBe(0);
  });

  // --- Customers ---

  it("tenant B cannot see tenant A's customers", async () => {
    await setContext(tenantBId);
    const rows = await appDb.select().from(customers);
    const leaked = rows.filter((r) => r.tenantId === tenantAId);
    expect(leaked.length).toBe(0);
  });

  it("tenant A can see their own customers", async () => {
    await setContext(tenantAId);
    const rows = await appDb.select().from(customers);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r) => r.tenantId === tenantAId)).toBe(true);
  });

  // --- Orders ---

  it("tenant B cannot see tenant A's orders", async () => {
    await setContext(tenantBId);
    const rows = await appDb.select().from(orders);
    const leaked = rows.filter((r) => r.tenantId === tenantAId);
    expect(leaked.length).toBe(0);
  });

  // --- Context switching ---

  it("switching context changes visible data", async () => {
    // As tenant A: see A's product.
    await setContext(tenantAId);
    const asA = await appDb.select().from(products);
    expect(asA.some((r) => r.name === "Secret Product A")).toBe(true);
    expect(asA.some((r) => r.name === "Public Product B")).toBe(false);

    // Switch to tenant B: see B's product, NOT A's.
    await setContext(tenantBId);
    const asB = await appDb.select().from(products);
    expect(asB.some((r) => r.name === "Public Product B")).toBe(true);
    expect(asB.some((r) => r.name === "Secret Product A")).toBe(false);
  });

  // --- Fail-closed: empty context ---

  it("empty tenant context returns zero rows (fail-closed)", async () => {
    await clearContext();
    const rows = await appDb.select().from(products);
    // With empty context, current_setting returns '' which can't cast to uuid,
    // so the USING clause evaluates to false for all rows -> zero results.
    expect(rows.length).toBe(0);
  });

  // --- INSERT isolation ---

  it("tenant B cannot insert a product with tenant A's ID", async () => {
    await setContext(tenantBId);
    try {
      await appDb.insert(products).values({
        tenantId: tenantAId, // Attempting to insert into wrong tenant
        name: "Malicious Product",
        slug: "malicious-product",
        stock: 1,
      });
      // If we get here, RLS didn't block the insert — fail the test.
      expect.unreachable("INSERT with wrong tenant_id should have been blocked by RLS");
    } catch (err: unknown) {
      // RLS should block this with a policy violation error.
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toMatch(/policy|permission|violat/i);
    }
  });
});

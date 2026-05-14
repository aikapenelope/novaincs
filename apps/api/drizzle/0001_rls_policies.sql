-- Row-Level Security policies for multi-tenant isolation.
-- Every tenant-scoped table gets RLS enabled with policies that
-- restrict access to rows matching the current session's tenant_id.
--
-- The session variable `app.current_tenant` is set by the API middleware
-- on every request after authenticating the user and resolving their tenant.
--
-- Three layers of defense:
--   1. API middleware adds tenant_id to every query (Hono)
--   2. Drizzle ORM filters by tenant_id (application level)
--   3. PostgreSQL RLS enforces at database level (this file)

-- === Enable RLS on all tenant-scoped tables ===

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;

-- === SELECT policies (tenant isolation) ===

CREATE POLICY tenant_isolation_products ON products
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_categories ON categories
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_customers ON customers
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_customer_events ON customer_events
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_orders ON orders
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- order_items: isolated via the order's tenant_id through a join.
-- Since order_items don't have tenant_id directly, we use the orders FK.
CREATE POLICY tenant_isolation_order_items ON order_items
    USING (order_id IN (
        SELECT id FROM orders
        WHERE tenant_id = current_setting('app.current_tenant', true)::uuid
    ));

CREATE POLICY tenant_isolation_payments ON payments
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_inventory_movements ON inventory_movements
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_tenant_members ON tenant_members
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- === INSERT policies (prevent inserting into wrong tenant) ===

CREATE POLICY tenant_insert_products ON products
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_categories ON categories
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_customers ON customers
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_customer_events ON customer_events
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_orders ON orders
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_payments ON payments
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_inventory_movements ON inventory_movements
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_tenant_members ON tenant_members
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- === Create a read-only role for nova-agents ===
-- Agents connect as this role and can only SELECT from business data.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'qyne_readonly') THEN
        CREATE ROLE qyne_readonly LOGIN;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO qyne_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO qyne_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO qyne_readonly;

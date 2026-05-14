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
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_configs ENABLE ROW LEVEL SECURITY;

-- === SELECT + UPDATE + DELETE policies (tenant isolation via USING clause) ===

CREATE POLICY tenant_isolation_products ON products
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_product_variants ON product_variants
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_categories ON categories
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_customers ON customers
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_customer_events ON customer_events
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_orders ON orders
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_order_items ON order_items
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_payments ON payments
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_inventory_movements ON inventory_movements
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_tenant_members ON tenant_members
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_payment_configs ON payment_configs
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- === INSERT policies (prevent inserting into wrong tenant) ===

CREATE POLICY tenant_insert_products ON products
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_product_variants ON product_variants
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_categories ON categories
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_customers ON customers
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_customer_events ON customer_events
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_orders ON orders
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_order_items ON order_items
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_payments ON payments
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_inventory_movements ON inventory_movements
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_tenant_members ON tenant_members
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_insert_payment_configs ON payment_configs
    FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

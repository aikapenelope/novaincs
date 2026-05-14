-- Application roles and automatic updated_at trigger.

-- === Application role (non-superuser, RLS enforced) ===
-- The API connects as this role. Agents connect as qyne_readonly.

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'qyne_app') THEN
        CREATE ROLE qyne_app LOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'qyne_readonly') THEN
        CREATE ROLE qyne_readonly LOGIN;
    END IF;
END
$$;

-- qyne_app: full CRUD on all tables (RLS restricts to current tenant).
GRANT USAGE ON SCHEMA public TO qyne_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO qyne_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO qyne_app;

-- qyne_readonly: SELECT only (for nova-agents container).
GRANT USAGE ON SCHEMA public TO qyne_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO qyne_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO qyne_readonly;

-- === Automatic updated_at trigger ===
-- Automatically sets updated_at = NOW() on every UPDATE.
-- Applied to all tables that have an updated_at column.

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to every table with updated_at.
CREATE TRIGGER set_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON product_variants
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON payment_configs
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

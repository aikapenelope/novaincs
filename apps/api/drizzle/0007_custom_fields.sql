-- Migration 0007: Custom field definitions
-- Sprint 18: Merchants can define custom fields on products and customers.
-- Values are stored in the entity's metadata JSONB column under "custom_fields" key.

CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL,
    field_key VARCHAR(100) NOT NULL,
    field_label VARCHAR(200) NOT NULL,
    field_type VARCHAR(50) NOT NULL,
    options JSONB NOT NULL DEFAULT '[]'::jsonb,
    required BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    placeholder VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS custom_fields_tenant_idx
    ON custom_field_definitions(tenant_id);
CREATE INDEX IF NOT EXISTS custom_fields_tenant_entity_idx
    ON custom_field_definitions(tenant_id, entity_type);
CREATE UNIQUE INDEX IF NOT EXISTS custom_fields_tenant_entity_key_idx
    ON custom_field_definitions(tenant_id, entity_type, field_key);

-- RLS
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY custom_field_definitions_tenant_isolation
    ON custom_field_definitions
    USING (tenant_id::text = current_setting('app.current_tenant', true));

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON custom_field_definitions TO qyne_app;
GRANT SELECT ON custom_field_definitions TO qyne_readonly;

-- Auto-update updated_at trigger
CREATE TRIGGER set_updated_at_custom_field_definitions
    BEFORE UPDATE ON custom_field_definitions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Constraint: entity_type must be 'product' or 'customer'
ALTER TABLE custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_entity_type_check
    CHECK (entity_type IN ('product', 'customer'));

-- Constraint: field_type must be one of the supported types
ALTER TABLE custom_field_definitions
    ADD CONSTRAINT custom_field_definitions_field_type_check
    CHECK (field_type IN ('text', 'number', 'date', 'select', 'boolean'));

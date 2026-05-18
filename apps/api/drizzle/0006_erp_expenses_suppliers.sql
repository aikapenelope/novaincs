-- Sprint 17: ERP-Lite — Expenses and Suppliers.

-- === 1. Suppliers ===

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  rif VARCHAR(50),
  address TEXT,
  products_supplied TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  last_order_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS suppliers_tenant_idx ON suppliers(tenant_id);
CREATE INDEX IF NOT EXISTS suppliers_tenant_name_idx ON suppliers(tenant_id, name);

-- === 2. Expenses ===

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  amount_bs NUMERIC(18, 2),
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  category VARCHAR(100) NOT NULL,
  description TEXT,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  payment_method VARCHAR(50),
  reference VARCHAR(255),
  expense_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  receipt_url TEXT,
  invoice_number VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_tenant_idx ON expenses(tenant_id);
CREATE INDEX IF NOT EXISTS expenses_tenant_date_idx ON expenses(tenant_id, expense_date);
CREATE INDEX IF NOT EXISTS expenses_tenant_category_idx ON expenses(tenant_id, category);
CREATE INDEX IF NOT EXISTS expenses_supplier_idx ON expenses(supplier_id);

-- === 3. RLS ===

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY suppliers_tenant_isolation ON suppliers
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);
CREATE POLICY suppliers_insert_policy ON suppliers
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY expenses_tenant_isolation ON expenses
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);
CREATE POLICY expenses_insert_policy ON expenses
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- === 4. Grants ===

GRANT SELECT, INSERT, UPDATE, DELETE ON suppliers TO qyne_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON expenses TO qyne_app;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'qyne_readonly') THEN
    GRANT SELECT ON suppliers TO qyne_readonly;
    GRANT SELECT ON expenses TO qyne_readonly;
  END IF;
END
$$;

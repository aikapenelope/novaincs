-- Sprint 15: Plan tiers, billing, and owner lock.

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_images_used INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_images_reset_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_pin_hash TEXT;

CREATE TABLE IF NOT EXISTS plan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_tier VARCHAR(50) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'USD',
  method VARCHAR(50) NOT NULL,
  screenshot_url TEXT,
  reference VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  verified_by VARCHAR(255),
  verified_at TIMESTAMPTZ,
  admin_notes TEXT,
  days_active VARCHAR(10) NOT NULL DEFAULT '30',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plan_payments_tenant_idx ON plan_payments(tenant_id);
CREATE INDEX IF NOT EXISTS plan_payments_status_idx ON plan_payments(status);
CREATE INDEX IF NOT EXISTS plan_payments_created_idx ON plan_payments(created_at);

ALTER TABLE plan_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_payments_tenant_isolation ON plan_payments
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY plan_payments_insert_policy ON plan_payments
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON plan_payments TO qyne_app;

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'qyne_readonly') THEN
    GRANT SELECT ON plan_payments TO qyne_readonly;
  END IF;
END
$$;

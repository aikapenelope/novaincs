-- Sprint 13: Smart Feed + Notifications tables.
-- Adds feed_items (AI-generated action cards) and notifications (real-time alerts).

-- === 1. Feed Items ===

CREATE TABLE IF NOT EXISTS feed_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  title VARCHAR(255) NOT NULL,
  body TEXT,
  entity_type VARCHAR(50),
  entity_id UUID,
  action_label VARCHAR(100),
  action_url VARCHAR(500),
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  data JSONB NOT NULL DEFAULT '{}',
  dedupe_key VARCHAR(255),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feed_items_tenant_idx ON feed_items(tenant_id);
CREATE INDEX IF NOT EXISTS feed_items_tenant_read_idx ON feed_items(tenant_id, is_read);
CREATE INDEX IF NOT EXISTS feed_items_tenant_created_idx ON feed_items(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS feed_items_dedupe_idx ON feed_items(tenant_id, dedupe_key);
CREATE INDEX IF NOT EXISTS feed_items_expires_idx ON feed_items(expires_at);

-- === 2. Notifications ===

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  action_url VARCHAR(500),
  entity_type VARCHAR(50),
  entity_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_tenant_idx ON notifications(tenant_id);
CREATE INDEX IF NOT EXISTS notifications_tenant_read_idx ON notifications(tenant_id, is_read);
CREATE INDEX IF NOT EXISTS notifications_tenant_created_idx ON notifications(tenant_id, created_at);

-- === 3. RLS Policies ===

ALTER TABLE feed_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Feed items: tenant isolation
CREATE POLICY feed_items_tenant_isolation ON feed_items
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY feed_items_insert_policy ON feed_items
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Notifications: tenant isolation
CREATE POLICY notifications_tenant_isolation ON notifications
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY notifications_insert_policy ON notifications
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- === 4. Grant access to qyne_app role ===

GRANT SELECT, INSERT, UPDATE, DELETE ON feed_items TO qyne_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO qyne_app;

-- Read-only access for agent container
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'qyne_readonly') THEN
    GRANT SELECT ON feed_items TO qyne_readonly;
    GRANT SELECT ON notifications TO qyne_readonly;
  END IF;
END
$$;

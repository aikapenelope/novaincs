-- Schema hardening migration.
-- Fixes identified during production audit (May 2026).
-- Safe to run on empty DB (0 rows in all tables).

-- === 1. payment_configs.is_active: varchar -> boolean ===
ALTER TABLE payment_configs
  ALTER COLUMN is_active DROP DEFAULT,
  ALTER COLUMN is_active TYPE boolean USING (is_active = 'true'),
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL;

-- === 2. CHECK constraints on status columns ===
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('created','payment_pending','screenshot_uploaded','verifying','verified','preparing','shipped','delivered','cancelled','expired','rejected'));

ALTER TABLE products ADD CONSTRAINT products_status_check
  CHECK (status IN ('active','draft','archived'));

ALTER TABLE product_variants ADD CONSTRAINT product_variants_status_check
  CHECK (status IN ('active','archived'));

ALTER TABLE payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending','screenshot_uploaded','verifying','verified','rejected'));

ALTER TABLE tenants ADD CONSTRAINT tenants_status_check
  CHECK (status IN ('active','suspended','deleted'));

-- === 3. categories: self-referencing foreign key ===
ALTER TABLE categories
  ADD CONSTRAINT categories_parent_id_fk
  FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL;

-- === 4. orders: unique order_number per tenant ===
DROP INDEX IF EXISTS orders_tenant_number_idx;
CREATE UNIQUE INDEX orders_tenant_number_unique_idx ON orders (tenant_id, order_number);

-- === 5. customers: unique phone per tenant ===
-- Use a partial unique index (only where phone IS NOT NULL) to allow
-- multiple customers without a phone number.
DROP INDEX IF EXISTS customers_tenant_phone_idx;
CREATE UNIQUE INDEX customers_tenant_phone_unique_idx ON customers (tenant_id, phone) WHERE phone IS NOT NULL;

-- === 6. inventory_movements: change product FK to SET NULL ===
ALTER TABLE inventory_movements
  DROP CONSTRAINT inventory_movements_product_id_products_id_fk,
  ADD CONSTRAINT inventory_movements_product_id_products_id_fk
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- Also make product_id nullable (was NOT NULL, needs to be nullable for SET NULL).
ALTER TABLE inventory_movements ALTER COLUMN product_id DROP NOT NULL;

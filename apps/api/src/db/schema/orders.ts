import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { customers } from "./customers.js";
import { products, productVariants } from "./products.js";

/**
 * Orders — a customer purchase.
 * Status lifecycle: created -> payment_pending -> screenshot_uploaded ->
 *   verifying -> verified -> preparing -> shipped -> delivered
 *   (or -> rejected -> payment_pending for retry)
 *
 * buyerName/buyerPhone are captured at checkout time so the order is
 * self-contained even before a customer record is created/linked.
 *
 * expiresAt controls stock reservation TTL (24h default). A Prefect job
 * releases reserved stock for expired unpaid orders.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    orderNumber: varchar("order_number", { length: 50 }).notNull(),
    // Buyer info captured at checkout (before customer record may exist)
    buyerName: varchar("buyer_name", { length: 255 }).notNull(),
    buyerPhone: varchar("buyer_phone", { length: 50 }),
    totalUsd: numeric("total_usd", { precision: 12, scale: 2 }).notNull(),
    totalBs: numeric("total_bs", { precision: 18, scale: 2 }),
    status: varchar("status", { length: 50 }).notNull().default("created"),
    paymentMethod: varchar("payment_method", { length: 50 }),
    paymentStatus: varchar("payment_status", { length: 50 }).notNull().default("pending"),
    paymentScreenshotUrl: text("payment_screenshot_url"),
    deliveryMethod: varchar("delivery_method", { length: 50 }).notNull().default("pickup"),
    deliveryAddress: text("delivery_address"),
    // Stock reservation expiry — NULL means no active reservation
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    notes: text("notes"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_tenant_idx").on(t.tenantId),
    index("orders_tenant_status_idx").on(t.tenantId, t.status),
    index("orders_customer_idx").on(t.customerId),
    index("orders_tenant_number_idx").on(t.tenantId, t.orderNumber),
    index("orders_created_idx").on(t.createdAt),
    index("orders_expires_idx").on(t.expiresAt),
  ],
);

/**
 * Order items — line items within an order.
 *
 * Has its own tenant_id for direct RLS enforcement (no subquery needed).
 * References both product and variant — variantId is NULL for simple products.
 */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    // Snapshot of product/variant name at time of purchase (immutable)
    productName: varchar("product_name", { length: 500 }).notNull(),
    variantName: varchar("variant_name", { length: 255 }),
    quantity: integer("quantity").notNull(),
    unitPriceUsd: numeric("unit_price_usd", { precision: 12, scale: 2 }).notNull(),
    unitPriceBs: numeric("unit_price_bs", { precision: 18, scale: 2 }),
  },
  (t) => [
    index("order_items_tenant_idx").on(t.tenantId),
    index("order_items_order_idx").on(t.orderId),
  ],
);

/**
 * Payments — tracks payment attempts and verification for an order.
 * Separated from orders to support multiple payment attempts per order.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    method: varchar("method", { length: 50 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    screenshotUrl: text("screenshot_url"),
    // OCR-extracted data from payment screenshot
    ocrData: jsonb("ocr_data"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: varchar("verified_by", { length: 50 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_tenant_idx").on(t.tenantId),
    index("payments_order_idx").on(t.orderId),
    index("payments_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

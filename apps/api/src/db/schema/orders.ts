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
import { products } from "./products.js";

/**
 * Orders — a customer purchase.
 * Status lifecycle: created -> payment_pending -> screenshot_uploaded ->
 *   verifying -> verified -> preparing -> shipped -> delivered
 *   (or -> rejected -> payment_pending for retry)
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
    totalUsd: numeric("total_usd", { precision: 12, scale: 2 }).notNull(),
    totalBs: numeric("total_bs", { precision: 18, scale: 2 }),
    status: varchar("status", { length: 50 }).notNull().default("created"),
    paymentMethod: varchar("payment_method", { length: 50 }),
    paymentStatus: varchar("payment_status", { length: 50 }).notNull().default("pending"),
    paymentScreenshotUrl: text("payment_screenshot_url"),
    deliveryMethod: varchar("delivery_method", { length: 50 }).notNull().default("pickup"),
    deliveryAddress: text("delivery_address"),
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
  ],
);

/**
 * Order items — line items within an order.
 */
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    productName: varchar("product_name", { length: 500 }).notNull(),
    quantity: integer("quantity").notNull(),
    unitPriceUsd: numeric("unit_price_usd", { precision: 12, scale: 2 }).notNull(),
    unitPriceBs: numeric("unit_price_bs", { precision: 18, scale: 2 }),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
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

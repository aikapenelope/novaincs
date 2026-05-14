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

/**
 * Customers — auto-populated from orders and behavioral tracking.
 * The merchant never fills out a form; profiles build from observed behavior.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 50 }),
    email: varchar("email", { length: 255 }),
    deliveryZone: varchar("delivery_zone", { length: 255 }),
    preferredPaymentMethod: varchar("preferred_payment_method", { length: 50 }),
    lifetimeValue: numeric("lifetime_value", { precision: 12, scale: 2 }).notNull().default("0"),
    totalOrders: integer("total_orders").notNull().default(0),
    averageOrderValue: numeric("average_order_value", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    lastPurchaseAt: timestamp("last_purchase_at", { withTimezone: true }),
    // RFM scores stored as JSONB: { recency: 1-5, frequency: 1-5, monetary: 1-5 }
    rfmScore: jsonb("rfm_score"),
    segment: varchar("segment", { length: 50 }),
    tags: jsonb("tags").notNull().default([]),
    // Anonymous session IDs merged into this customer (identity resolution)
    visitorIds: jsonb("visitor_ids").notNull().default([]),
    notes: text("notes"),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("customers_tenant_idx").on(t.tenantId),
    index("customers_tenant_phone_idx").on(t.tenantId, t.phone),
    index("customers_tenant_segment_idx").on(t.tenantId, t.segment),
  ],
);

/**
 * Customer events — behavioral tracking (catalog visits, cart actions, messages).
 * High-volume, append-only. Partition by month in production for large tenants.
 */
export const customerEvents = pgTable(
  "customer_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    entityType: varchar("entity_type", { length: 50 }),
    entityId: uuid("entity_id"),
    actorType: varchar("actor_type", { length: 50 }).notNull().default("customer"),
    actorId: varchar("actor_id", { length: 255 }),
    data: jsonb("data").notNull().default({}),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("customer_events_tenant_idx").on(t.tenantId),
    index("customer_events_tenant_type_idx").on(t.tenantId, t.eventType),
    index("customer_events_customer_idx").on(t.customerId),
    index("customer_events_created_idx").on(t.createdAt),
  ],
);

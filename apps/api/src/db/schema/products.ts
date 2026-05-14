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
 * Categories — product groupings per tenant.
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    parentId: uuid("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("categories_tenant_idx").on(t.tenantId),
    index("categories_tenant_slug_idx").on(t.tenantId, t.slug),
  ],
);

/**
 * Products — the core catalog entity.
 * Dual pricing (USD + Bs), AI-enhanced images, pgvector embedding for semantic search.
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 500 }).notNull(),
    description: text("description"),
    priceUsd: numeric("price_usd", { precision: 12, scale: 2 }),
    priceBs: numeric("price_bs", { precision: 18, scale: 2 }),
    costUsd: numeric("cost_usd", { precision: 12, scale: 2 }),
    sku: varchar("sku", { length: 100 }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    stock: integer("stock").notNull().default(0),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    images: jsonb("images").notNull().default([]),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_tenant_idx").on(t.tenantId),
    index("products_tenant_status_idx").on(t.tenantId, t.status),
    index("products_category_idx").on(t.categoryId),
  ],
);

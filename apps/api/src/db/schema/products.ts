import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
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
    description: text("description"),
    imageUrl: text("image_url"),
    parentId: uuid("parent_id").references((): any => categories.id, { onDelete: "set null" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("categories_tenant_idx").on(t.tenantId),
    uniqueIndex("categories_tenant_slug_idx").on(t.tenantId, t.slug),
  ],
);

/**
 * Products — the core catalog entity.
 *
 * Dual pricing (USD + Bs). Prices on the product are the base/default prices.
 * If the product has variants, each variant can override the price.
 * `stock` on the product is the sum of all variant stocks (or direct stock if no variants).
 * `hasVariants` indicates whether to look at product_variants for stock/price.
 *
 * `options` defines the available option axes: {"color": ["Azul","Rojo"], "talla": ["S","M","L"]}
 * These are used by the frontend to render selectors and by variants to define combinations.
 */
export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 500 }).notNull(),
    slug: varchar("slug", { length: 500 }).notNull(),
    description: text("description"),
    priceUsd: numeric("price_usd", { precision: 12, scale: 2 }),
    priceBs: numeric("price_bs", { precision: 18, scale: 2 }),
    costUsd: numeric("cost_usd", { precision: 12, scale: 2 }),
    sku: varchar("sku", { length: 100 }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    stock: integer("stock").notNull().default(0),
    hasVariants: boolean("has_variants").notNull().default(false),
    // Option axes defined by the merchant: {"color": ["Azul","Rojo"], "talla": ["S","M","L"]}
    options: jsonb("options").notNull().default({}),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    images: jsonb("images").notNull().default([]),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_tenant_idx").on(t.tenantId),
    uniqueIndex("products_tenant_slug_idx").on(t.tenantId, t.slug),
    index("products_tenant_status_idx").on(t.tenantId, t.status),
    index("products_category_idx").on(t.categoryId),
  ],
);

/**
 * Product variants — specific combinations of product options.
 *
 * Example: Product "Camisa Polo" has variants:
 *   - { options: {"color":"Azul","talla":"M"}, sku: "POLO-AZ-M", stock: 5 }
 *   - { options: {"color":"Rojo","talla":"L"}, sku: "POLO-RO-L", stock: 3 }
 *
 * Each variant has its own stock and can override the parent product's price.
 * If priceUsd is NULL, the parent product's price is used.
 */
export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    sku: varchar("sku", { length: 100 }),
    // Price overrides (NULL = use parent product price)
    priceUsd: numeric("price_usd", { precision: 12, scale: 2 }),
    priceBs: numeric("price_bs", { precision: 18, scale: 2 }),
    costUsd: numeric("cost_usd", { precision: 12, scale: 2 }),
    stock: integer("stock").notNull().default(0),
    // The specific option values: {"color": "Azul", "talla": "M"}
    options: jsonb("options").notNull().default({}),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_variants_tenant_idx").on(t.tenantId),
    index("product_variants_product_idx").on(t.productId),
    index("product_variants_tenant_sku_idx").on(t.tenantId, t.sku),
  ],
);

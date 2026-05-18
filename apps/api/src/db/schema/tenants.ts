import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  numeric,
  jsonb,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * Tenants — each row is a merchant account.
 * Single-user tenancy: one merchant = one account.
 * Multi-user support via tenant_members.
 *
 * `planTier` is the tier name (free/starter/pro/business).
 * `planOverrides` stores per-tenant feature/limit overrides (e.g., promotional extra images).
 * The effective plan is computed at runtime: PLAN_DEFAULTS[planTier] merged with planOverrides.
 */
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    ownerUserId: varchar("owner_user_id", { length: 255 }).notNull(),
    // Branding
    description: text("description"),
    logoUrl: text("logo_url"),
    // Custom domain: "carlos-fashion.qyne.app" or "www.carlosfashion.com"
    domain: varchar("domain", { length: 255 }),
    // Plan
    planTier: varchar("plan_tier", { length: 50 }).notNull().default("starter"),
    planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
    planOverrides: jsonb("plan_overrides").notNull().default({}),
    aiImagesUsed: integer("ai_images_used").notNull().default(0),
    aiImagesResetAt: timestamp("ai_images_reset_at", { withTimezone: true }),
    ownerPinHash: text("owner_pin_hash"),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    settings: jsonb("settings").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tenants_slug_idx").on(t.slug),
    uniqueIndex("tenants_domain_idx").on(t.domain),
    index("tenants_owner_idx").on(t.ownerUserId),
  ],
);

/**
 * Tenant members — maps Clerk users to tenants with roles.
 * Supports the common pattern: owner + 1-2 employees.
 * Roles: owner, admin, member, viewer (see doc 02 section 5.4).
 */
export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 255 }).notNull(),
    role: varchar("role", { length: 50 }).notNull().default("member"),
    permissions: jsonb("permissions").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tenant_members_unique_idx").on(t.tenantId, t.userId)],
);

/**
 * Payment configs — merchant's payment method settings.
 * Each merchant configures their Pago Movil/Zelle bank details here.
 *
 * details JSONB examples:
 *   Pago Movil: { phone: "0414-1234567", cedula: "V-12345678", bank: "Banesco" }
 *   Zelle: { email: "carlos@gmail.com", name: "Carlos Rodriguez" }
 */
export const paymentConfigs = pgTable(
  "payment_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    method: varchar("method", { length: 50 }).notNull(),
    label: varchar("label", { length: 100 }),
    details: jsonb("details").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_configs_tenant_idx").on(t.tenantId)],
);

/**
 * Exchange rates — historical record of currency rates.
 * Updated every 15 minutes from BCV API by a Prefect flow.
 * Used for dual pricing (USD -> Bs) and for auditing at what rate each sale was made.
 */
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: varchar("source", { length: 50 }).notNull(),
    fromCurrency: varchar("from_currency", { length: 10 }).notNull().default("USD"),
    toCurrency: varchar("to_currency", { length: 10 }).notNull().default("VES"),
    rate: numeric("rate", { precision: 18, scale: 4 }).notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("exchange_rates_effective_idx").on(t.effectiveAt),
    index("exchange_rates_source_idx").on(t.source, t.effectiveAt),
  ],
);

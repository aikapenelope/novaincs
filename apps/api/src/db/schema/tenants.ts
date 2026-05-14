import { pgTable, uuid, varchar, jsonb, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";

/**
 * Tenants — each row is a merchant account.
 * Single-user tenancy: one merchant = one account.
 * Multi-user support via tenant_members.
 */
export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    ownerUserId: varchar("owner_user_id", { length: 255 }).notNull(),
    plan: varchar("plan", { length: 50 }).notNull().default("free"),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    settings: jsonb("settings").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tenants_slug_idx").on(t.slug), index("tenants_owner_idx").on(t.ownerUserId)],
);

/**
 * Tenant members — maps Clerk users to tenants with roles.
 * Supports the common pattern: owner + 1-2 employees.
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

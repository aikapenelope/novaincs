import { pgTable, uuid, varchar, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Plan payments — tracks subscription payment attempts.
 * Merchant transfers money and uploads screenshot. Admin verifies and activates.
 */
export const planPayments = pgTable(
  "plan_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    requestedTier: varchar("requested_tier", { length: 50 }).notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    method: varchar("method", { length: 50 }).notNull(),
    screenshotUrl: text("screenshot_url"),
    reference: varchar("reference", { length: 255 }),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    verifiedBy: varchar("verified_by", { length: 255 }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    adminNotes: text("admin_notes"),
    daysActive: varchar("days_active", { length: 10 }).notNull().default("30"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("plan_payments_tenant_idx").on(t.tenantId),
    index("plan_payments_status_idx").on(t.status),
    index("plan_payments_created_idx").on(t.createdAt),
  ],
);

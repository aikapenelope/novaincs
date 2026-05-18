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
 * Suppliers — vendor/provider management.
 *
 * Tracks who supplies what to the merchant: name, contact info,
 * products they provide, and last order date.
 */
export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    contactName: varchar("contact_name", { length: 255 }),
    phone: varchar("phone", { length: 50 }),
    email: varchar("email", { length: 255 }),
    rif: varchar("rif", { length: 50 }),
    address: text("address"),
    // What they supply (free text or structured)
    productsSupplied: text("products_supplied"),
    notes: text("notes"),
    metadata: jsonb("metadata").notNull().default({}),
    lastOrderAt: timestamp("last_order_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("suppliers_tenant_idx").on(t.tenantId),
    index("suppliers_tenant_name_idx").on(t.tenantId, t.name),
  ],
);

/**
 * Expenses — manual expense tracking for P&L.
 *
 * The merchant logs expenses (purchases from suppliers, rent, services, etc.)
 * and the system calculates profit: Revenue - Expenses = Net Profit.
 *
 * Categories are flexible (merchant-defined via the category field).
 * Common categories: inventory, rent, services, transport, marketing, other.
 */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Amount in USD (primary currency)
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    amountBs: numeric("amount_bs", { precision: 18, scale: 2 }),
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    // Classification
    category: varchar("category", { length: 100 }).notNull(),
    description: text("description"),
    // Optional supplier link
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    // Payment info
    paymentMethod: varchar("payment_method", { length: 50 }),
    reference: varchar("reference", { length: 255 }),
    // When the expense occurred (may differ from created_at)
    expenseDate: timestamp("expense_date", { withTimezone: true }).notNull().defaultNow(),
    // Receipt/invoice
    receiptUrl: text("receipt_url"),
    invoiceNumber: varchar("invoice_number", { length: 100 }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("expenses_tenant_idx").on(t.tenantId),
    index("expenses_tenant_date_idx").on(t.tenantId, t.expenseDate),
    index("expenses_tenant_category_idx").on(t.tenantId, t.category),
    index("expenses_supplier_idx").on(t.supplierId),
  ],
);

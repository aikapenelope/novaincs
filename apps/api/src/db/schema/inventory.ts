import { pgTable, uuid, varchar, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { products } from "./products.js";

/**
 * Inventory movements — append-only log of stock changes.
 * Every stock adjustment (sale, manual +/-, return) creates a movement record.
 */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    // Positive = stock in, negative = stock out
    quantity: integer("quantity").notNull(),
    reason: varchar("reason", { length: 50 }).notNull(),
    referenceId: uuid("reference_id"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inventory_movements_tenant_idx").on(t.tenantId),
    index("inventory_movements_product_idx").on(t.productId),
    index("inventory_movements_created_idx").on(t.createdAt),
  ],
);

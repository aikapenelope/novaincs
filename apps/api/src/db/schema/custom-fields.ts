import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

/**
 * Custom field definitions — merchant-defined extra fields on entities.
 *
 * Each merchant can define custom fields for products and customers.
 * Examples:
 *   - A clothing store adds "material" (text) and "temporada" (select: Verano, Invierno)
 *   - A wholesaler adds "rif" (text) and "credit_limit" (number) to customers
 *
 * Field types: text, number, date, select, boolean
 * For "select" type, `options` contains the allowed values: ["Talla S", "Talla M", "Talla L"]
 *
 * Values are stored in the entity's `metadata` JSONB column under the key "custom_fields":
 *   products.metadata -> { "custom_fields": { "material": "Algodon", "temporada": "Verano" } }
 *   customers.metadata -> { "custom_fields": { "tipo_negocio": "Mayorista", "rif": "J-12345678-9" } }
 */
export const customFieldDefinitions = pgTable(
  "custom_field_definitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    /** Which entity type this field applies to: 'product' or 'customer' */
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    /** Internal field key (slug-like, used in metadata JSONB) */
    fieldKey: varchar("field_key", { length: 100 }).notNull(),
    /** Display label shown in the UI */
    fieldLabel: varchar("field_label", { length: 200 }).notNull(),
    /** Data type: text, number, date, select, boolean */
    fieldType: varchar("field_type", { length: 50 }).notNull(),
    /** For 'select' type: array of allowed values. e.g. ["Talla S", "Talla M", "Talla L"] */
    options: jsonb("options").notNull().default([]),
    /** Whether this field is required when creating/editing the entity */
    required: boolean("required").notNull().default(false),
    /** Display order in forms */
    sortOrder: integer("sort_order").notNull().default(0),
    /** Placeholder text for the input */
    placeholder: varchar("placeholder", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("custom_fields_tenant_idx").on(t.tenantId),
    index("custom_fields_tenant_entity_idx").on(t.tenantId, t.entityType),
    uniqueIndex("custom_fields_tenant_entity_key_idx").on(t.tenantId, t.entityType, t.fieldKey),
  ],
);

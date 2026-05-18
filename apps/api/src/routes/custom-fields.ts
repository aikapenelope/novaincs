import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, asc, count } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { customFieldDefinitions } from "../db/schema/custom-fields.js";
import { products } from "../db/schema/products.js";
import { customers } from "../db/schema/customers.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";
import { requirePlanFeature } from "../middleware/plan-gate.js";

export const customFieldRoutes = new Hono<AppEnv>();

customFieldRoutes.use("*", authMiddleware, tenantMiddleware);
customFieldRoutes.use("*", requirePlanFeature("custom_fields"));

// --- Validation schemas ---

const entityTypeEnum = z.enum(["product", "customer"]);
const fieldTypeEnum = z.enum(["text", "number", "date", "select", "boolean"]);

const createFieldSchema = z
  .object({
    entityType: entityTypeEnum,
    fieldKey: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9_]+$/, "Solo letras minusculas, numeros y guion bajo"),
    fieldLabel: z.string().min(1).max(200),
    fieldType: fieldTypeEnum,
    options: z.array(z.string().max(100)).max(50).default([]),
    required: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(999).default(0),
    placeholder: z.string().max(255).nullish(),
  })
  .refine(
    (data) => {
      // 'select' type must have at least one option
      if (data.fieldType === "select" && data.options.length === 0) return false;
      return true;
    },
    { message: "El tipo 'select' requiere al menos una opcion", path: ["options"] },
  );

const updateFieldSchema = z.object({
  fieldLabel: z.string().min(1).max(200).optional(),
  options: z.array(z.string().max(100)).max(50).optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  placeholder: z.string().max(255).nullish(),
});

const setValuesSchema = z.object({
  customFields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

// --- Routes: Field Definitions ---

/**
 * GET /custom-fields/definitions?entityType=product|customer
 * List all custom field definitions for the tenant, filtered by entity type.
 */
customFieldRoutes.get(
  "/definitions",
  zValidator("query", z.object({ entityType: entityTypeEnum })),
  async (c) => {
    const tenantId = c.get("tenantId")!;
    const { entityType } = c.req.valid("query");
    const db = getDb();

    const fields = await db
      .select()
      .from(customFieldDefinitions)
      .where(
        and(
          eq(customFieldDefinitions.tenantId, tenantId),
          eq(customFieldDefinitions.entityType, entityType),
        ),
      )
      .orderBy(asc(customFieldDefinitions.sortOrder), asc(customFieldDefinitions.createdAt));

    return c.json({ data: fields });
  },
);

/**
 * POST /custom-fields/definitions — Create a new custom field definition.
 */
customFieldRoutes.post(
  "/definitions",
  zValidator("json", createFieldSchema),
  async (c) => {
    const tenantId = c.get("tenantId")!;
    const body = c.req.valid("json");
    const db = getDb();

    // Check max 20 fields per entity type
    const [existing] = await db
      .select({ total: count() })
      .from(customFieldDefinitions)
      .where(
        and(
          eq(customFieldDefinitions.tenantId, tenantId),
          eq(customFieldDefinitions.entityType, body.entityType),
        ),
      );

    if ((existing?.total ?? 0) >= 20) {
      return c.json(
        { error: { message: "Maximo 20 campos personalizados por tipo de entidad", status: 400 } },
        400,
      );
    }

    const [field] = await db
      .insert(customFieldDefinitions)
      .values({
        tenantId,
        entityType: body.entityType,
        fieldKey: body.fieldKey,
        fieldLabel: body.fieldLabel,
        fieldType: body.fieldType,
        options: body.options,
        required: body.required,
        sortOrder: body.sortOrder,
        placeholder: body.placeholder ?? null,
      })
      .returning();

    return c.json({ data: field }, 201);
  },
);

/**
 * PATCH /custom-fields/definitions/:id — Update a custom field definition.
 */
customFieldRoutes.patch(
  "/definitions/:id",
  zValidator("json", updateFieldSchema),
  async (c) => {
    const tenantId = c.get("tenantId")!;
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const db = getDb();

    const updates: Record<string, unknown> = {};
    if (body.fieldLabel !== undefined) updates.fieldLabel = body.fieldLabel;
    if (body.options !== undefined) updates.options = body.options;
    if (body.required !== undefined) updates.required = body.required;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
    if (body.placeholder !== undefined) updates.placeholder = body.placeholder;

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { message: "No hay campos para actualizar", status: 400 } }, 400);
    }

    const [updated] = await db
      .update(customFieldDefinitions)
      .set(updates)
      .where(and(eq(customFieldDefinitions.id, id), eq(customFieldDefinitions.tenantId, tenantId)))
      .returning();

    if (!updated) {
      return c.json({ error: { message: "Campo no encontrado", status: 404 } }, 404);
    }

    return c.json({ data: updated });
  },
);

/**
 * DELETE /custom-fields/definitions/:id — Delete a custom field definition.
 * Note: This does NOT remove existing values from entity metadata.
 */
customFieldRoutes.delete("/definitions/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");
  const db = getDb();

  const [deleted] = await db
    .delete(customFieldDefinitions)
    .where(and(eq(customFieldDefinitions.id, id), eq(customFieldDefinitions.tenantId, tenantId)))
    .returning({ id: customFieldDefinitions.id });

  if (!deleted) {
    return c.json({ error: { message: "Campo no encontrado", status: 404 } }, 404);
  }

  return c.json({ data: { id: deleted.id, deleted: true } });
});

// --- Routes: Field Values ---

/**
 * PUT /custom-fields/values/product/:productId — Set custom field values on a product.
 * Merges into products.metadata.custom_fields.
 */
customFieldRoutes.put(
  "/values/product/:productId",
  zValidator("json", setValuesSchema),
  async (c) => {
    const tenantId = c.get("tenantId")!;
    const productId = c.req.param("productId");
    const { customFields } = c.req.valid("json");
    const db = getDb();

    // Validate that the product belongs to this tenant
    const [product] = await db
      .select({ id: products.id, metadata: products.metadata })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
      .limit(1);

    if (!product) {
      return c.json({ error: { message: "Producto no encontrado", status: 404 } }, 404);
    }

    // Merge custom fields into existing metadata
    const currentMetadata = (product.metadata as Record<string, unknown>) ?? {};
    const updatedMetadata = {
      ...currentMetadata,
      custom_fields: {
        ...((currentMetadata.custom_fields as Record<string, unknown>) ?? {}),
        ...customFields,
      },
    };

    // Remove null values (null = delete the field value)
    const cf = updatedMetadata.custom_fields as Record<string, unknown>;
    for (const key of Object.keys(cf)) {
      if (cf[key] === null) delete cf[key];
    }

    await db
      .update(products)
      .set({ metadata: updatedMetadata })
      .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)));

    return c.json({ data: { productId, customFields: cf } });
  },
);

/**
 * PUT /custom-fields/values/customer/:customerId — Set custom field values on a customer.
 * Merges into customers.metadata.custom_fields.
 */
customFieldRoutes.put(
  "/values/customer/:customerId",
  zValidator("json", setValuesSchema),
  async (c) => {
    const tenantId = c.get("tenantId")!;
    const customerId = c.req.param("customerId");
    const { customFields } = c.req.valid("json");
    const db = getDb();

    // Validate that the customer belongs to this tenant
    const [customer] = await db
      .select({ id: customers.id, metadata: customers.metadata })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
      .limit(1);

    if (!customer) {
      return c.json({ error: { message: "Cliente no encontrado", status: 404 } }, 404);
    }

    // Merge custom fields into existing metadata
    const currentMetadata = (customer.metadata as Record<string, unknown>) ?? {};
    const updatedMetadata = {
      ...currentMetadata,
      custom_fields: {
        ...((currentMetadata.custom_fields as Record<string, unknown>) ?? {}),
        ...customFields,
      },
    };

    // Remove null values (null = delete the field value)
    const cf = updatedMetadata.custom_fields as Record<string, unknown>;
    for (const key of Object.keys(cf)) {
      if (cf[key] === null) delete cf[key];
    }

    await db
      .update(customers)
      .set({ metadata: updatedMetadata })
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)));

    return c.json({ data: { customerId, customFields: cf } });
  },
);

/**
 * GET /custom-fields/values/product/:productId — Get custom field values for a product.
 */
customFieldRoutes.get("/values/product/:productId", async (c) => {
  const tenantId = c.get("tenantId")!;
  const productId = c.req.param("productId");
  const db = getDb();

  const [product] = await db
    .select({ metadata: products.metadata })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) {
    return c.json({ error: { message: "Producto no encontrado", status: 404 } }, 404);
  }

  const metadata = (product.metadata as Record<string, unknown>) ?? {};
  const customFields = (metadata.custom_fields as Record<string, unknown>) ?? {};

  return c.json({ data: { productId, customFields } });
});

/**
 * GET /custom-fields/values/customer/:customerId — Get custom field values for a customer.
 */
customFieldRoutes.get("/values/customer/:customerId", async (c) => {
  const tenantId = c.get("tenantId")!;
  const customerId = c.req.param("customerId");
  const db = getDb();

  const [customer] = await db
    .select({ metadata: customers.metadata })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: { message: "Cliente no encontrado", status: 404 } }, 404);
  }

  const metadata = (customer.metadata as Record<string, unknown>) ?? {};
  const customFields = (metadata.custom_fields as Record<string, unknown>) ?? {};

  return c.json({ data: { customerId, customFields } });
});

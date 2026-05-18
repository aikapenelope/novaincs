import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql, ilike, count } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { products, productVariants } from "../db/schema/products.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";

export const productRoutes = new Hono<AppEnv>();

// All product routes require auth + tenant context.
productRoutes.use("*", authMiddleware, tenantMiddleware);

// --- Schemas ---

const priceString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/)
  .nullish();

const createProductSchema = z.object({
  name: z.string().min(1).max(500),
  slug: z
    .string()
    .min(1)
    .max(500)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().nullish(),
  priceUsd: priceString,
  priceBs: priceString,
  costUsd: priceString,
  sku: z.string().max(100).nullish(),
  categoryId: z.string().uuid().nullish(),
  stock: z.number().int().min(0).default(0),
  status: z.enum(["active", "draft", "archived"]).default("active"),
  images: z.array(z.unknown()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

const updateProductSchema = createProductSchema.partial().omit({ slug: true });

const listProductsSchema = z.object({
  search: z.string().max(200).optional(),
  status: z.enum(["active", "draft", "archived"]).optional(),
  categoryId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createVariantSchema = z.object({
  name: z.string().min(1).max(255),
  sku: z.string().max(100).nullish(),
  priceUsd: priceString,
  priceBs: priceString,
  costUsd: priceString,
  stock: z.number().int().min(0).default(0),
  options: z.record(z.string()).default({}),
  status: z.enum(["active", "archived"]).default("active"),
  sortOrder: z.number().int().default(0),
});

const updateVariantSchema = createVariantSchema.partial();

// --- Product routes ---

/**
 * GET /products — List products for the current tenant.
 * Supports search by name, filtering by status/category, and pagination.
 * Returns { data, total } so the frontend can render pagination controls.
 */
productRoutes.get("/", zValidator("query", listProductsSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const query = c.req.valid("query");
  const db = getDb();

  const conditions = [eq(products.tenantId, tenantId)];
  if (query.status) conditions.push(eq(products.status, query.status));
  if (query.categoryId) conditions.push(eq(products.categoryId, query.categoryId));
  if (query.search) conditions.push(ilike(products.name, `%${query.search}%`));

  const where = and(...conditions);

  // Run data query and count query in parallel.
  const [rows, [countResult]] = await Promise.all([
    db
      .select()
      .from(products)
      .where(where)
      .orderBy(desc(products.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(products).where(where),
  ]);

  return c.json({
    data: rows,
    total: countResult?.total ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
});

/**
 * GET /products/:id — Get a single product with its variants.
 */
productRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const productId = c.req.param("id");
  const db = getDb();

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) {
    return c.json({ error: { message: "Product not found", status: 404 } }, 404);
  }

  let variants: (typeof productVariants.$inferSelect)[] = [];
  if (product.hasVariants) {
    variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .orderBy(productVariants.sortOrder);
  }

  return c.json({ data: { ...product, variants } });
});

/**
 * GET /products/by-slug/:slug — Get a product by slug (for public catalog).
 */
productRoutes.get("/by-slug/:slug", async (c) => {
  const tenantId = c.get("tenantId")!;
  const slug = c.req.param("slug");
  const db = getDb();

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) {
    return c.json({ error: { message: "Product not found", status: 404 } }, 404);
  }

  let variants: (typeof productVariants.$inferSelect)[] = [];
  if (product.hasVariants) {
    variants = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, product.id))
      .orderBy(productVariants.sortOrder);
  }

  return c.json({ data: { ...product, variants } });
});

/**
 * POST /products — Create a new product.
 */
productRoutes.post("/", zValidator("json", createProductSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const body = c.req.valid("json");
  const db = getDb();

  // Check slug uniqueness within tenant.
  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.tenantId, tenantId), eq(products.slug, body.slug)))
    .limit(1);

  if (existing) {
    return c.json({ error: { message: "Product slug already exists", status: 409 } }, 409);
  }

  const [product] = await db
    .insert(products)
    .values({
      tenantId,
      name: body.name,
      slug: body.slug,
      description: body.description ?? null,
      priceUsd: body.priceUsd ?? null,
      priceBs: body.priceBs ?? null,
      costUsd: body.costUsd ?? null,
      sku: body.sku ?? null,
      categoryId: body.categoryId ?? null,
      stock: body.stock,
      status: body.status,
      images: body.images,
      metadata: body.metadata,
    })
    .returning();

  return c.json({ data: product }, 201);
});

/**
 * PATCH /products/:id — Update a product.
 */
productRoutes.patch("/:id", zValidator("json", updateProductSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const productId = c.req.param("id");
  const body = c.req.valid("json");
  const db = getDb();

  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: { message: "Product not found", status: 404 } }, 404);
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.priceUsd !== undefined) updates.priceUsd = body.priceUsd;
  if (body.priceBs !== undefined) updates.priceBs = body.priceBs;
  if (body.costUsd !== undefined) updates.costUsd = body.costUsd;
  if (body.sku !== undefined) updates.sku = body.sku;
  if (body.categoryId !== undefined) updates.categoryId = body.categoryId;
  if (body.stock !== undefined) updates.stock = body.stock;
  if (body.status !== undefined) updates.status = body.status;
  if (body.images !== undefined) updates.images = body.images;
  if (body.metadata !== undefined) updates.metadata = body.metadata;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: { message: "No fields to update", status: 400 } }, 400);
  }

  const [updated] = await db
    .update(products)
    .set(updates)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .returning();

  return c.json({ data: updated });
});

/**
 * DELETE /products/:id — Soft-delete a product (set status to archived).
 */
productRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const productId = c.req.param("id");
  const db = getDb();

  const [updated] = await db
    .update(products)
    .set({ status: "archived" })
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .returning({ id: products.id });

  if (!updated) {
    return c.json({ error: { message: "Product not found", status: 404 } }, 404);
  }

  return c.json({ data: { id: updated.id, deleted: true } });
});

// --- Batch import ---

const importProductSchema = z.object({
  name: z.string().min(1).max(500),
  priceUsd: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .nullish(),
  stock: z.number().int().min(0).default(0),
  sku: z.string().max(100).nullish(),
  description: z.string().nullish(),
});

const batchImportSchema = z.object({
  products: z.array(importProductSchema).min(1).max(500),
});

/**
 * POST /products/import — Batch import products from CSV/Excel.
 *
 * Accepts an array of products. Generates slugs automatically.
 * Skips products with duplicate slugs within the batch or existing in DB.
 * Returns the count of imported and skipped products.
 */
productRoutes.post("/import", zValidator("json", batchImportSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const body = c.req.valid("json");
  const db = getDb();

  let imported = 0;
  let skipped = 0;

  for (const item of body.products) {
    // Generate slug from name.
    const slug = item.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    // Check if slug already exists for this tenant.
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.tenantId, tenantId), eq(products.slug, slug)))
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    await db.insert(products).values({
      tenantId,
      name: item.name,
      slug,
      priceUsd: item.priceUsd ?? null,
      stock: item.stock,
      sku: item.sku ?? null,
      description: item.description ?? null,
      status: "active",
    });

    imported++;
  }

  return c.json({ data: { imported, skipped, total: body.products.length } });
});

// --- Variant sub-routes ---

/** Recalculate parent product's total stock from active variants. */
async function recalculateProductStock(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  productId: string,
) {
  const stockResult = await tx
    .select({ total: sql<number>`COALESCE(SUM(${productVariants.stock}), 0)` })
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), eq(productVariants.status, "active")));

  const totalStock = Number(stockResult[0]?.total ?? 0);

  // Check if any active variants remain.
  const [activeCount] = await tx
    .select({ n: count() })
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), eq(productVariants.status, "active")));

  const hasVariants = (activeCount?.n ?? 0) > 0;

  await tx
    .update(products)
    .set({ stock: totalStock, hasVariants })
    .where(eq(products.id, productId));
}

/**
 * POST /products/:id/variants — Add a variant to a product.
 */
productRoutes.post("/:id/variants", zValidator("json", createVariantSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const productId = c.req.param("id");
  const body = c.req.valid("json");
  const db = getDb();

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) {
    return c.json({ error: { message: "Product not found", status: 404 } }, 404);
  }

  const result = await db.transaction(async (tx) => {
    const [variant] = await tx
      .insert(productVariants)
      .values({
        tenantId,
        productId,
        name: body.name,
        sku: body.sku ?? null,
        priceUsd: body.priceUsd ?? null,
        priceBs: body.priceBs ?? null,
        costUsd: body.costUsd ?? null,
        stock: body.stock,
        options: body.options,
        status: body.status,
        sortOrder: body.sortOrder,
      })
      .returning();

    await recalculateProductStock(tx, productId);
    return variant;
  });

  return c.json({ data: result }, 201);
});

/**
 * GET /products/:id/variants — List variants for a product.
 */
productRoutes.get("/:id/variants", async (c) => {
  const tenantId = c.get("tenantId")!;
  const productId = c.req.param("id");
  const db = getDb();

  const variants = await db
    .select()
    .from(productVariants)
    .where(and(eq(productVariants.productId, productId), eq(productVariants.tenantId, tenantId)))
    .orderBy(productVariants.sortOrder);

  return c.json({ data: variants });
});

/**
 * PATCH /products/:id/variants/:variantId — Update a variant.
 * Recalculates parent product stock after update.
 */
productRoutes.patch(
  "/:id/variants/:variantId",
  zValidator("json", updateVariantSchema),
  async (c) => {
    const tenantId = c.get("tenantId")!;
    const productId = c.req.param("id");
    const variantId = c.req.param("variantId");
    const body = c.req.valid("json");
    const db = getDb();

    const [existing] = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.id, variantId),
          eq(productVariants.productId, productId),
          eq(productVariants.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json({ error: { message: "Variant not found", status: 404 } }, 404);
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.sku !== undefined) updates.sku = body.sku;
    if (body.priceUsd !== undefined) updates.priceUsd = body.priceUsd;
    if (body.priceBs !== undefined) updates.priceBs = body.priceBs;
    if (body.costUsd !== undefined) updates.costUsd = body.costUsd;
    if (body.stock !== undefined) updates.stock = body.stock;
    if (body.options !== undefined) updates.options = body.options;
    if (body.status !== undefined) updates.status = body.status;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

    if (Object.keys(updates).length === 0) {
      return c.json({ error: { message: "No fields to update", status: 400 } }, 400);
    }

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(productVariants)
        .set(updates)
        .where(eq(productVariants.id, variantId))
        .returning();

      await recalculateProductStock(tx, productId);
      return updated;
    });

    return c.json({ data: result });
  },
);

/**
 * DELETE /products/:id/variants/:variantId — Delete a variant.
 * Recalculates parent product stock. If no active variants remain,
 * sets hasVariants=false on the parent product.
 */
productRoutes.delete("/:id/variants/:variantId", async (c) => {
  const tenantId = c.get("tenantId")!;
  const productId = c.req.param("id");
  const variantId = c.req.param("variantId");
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(productVariants)
      .where(
        and(
          eq(productVariants.id, variantId),
          eq(productVariants.productId, productId),
          eq(productVariants.tenantId, tenantId),
        ),
      )
      .returning({ id: productVariants.id });

    if (!deleted) return null;

    await recalculateProductStock(tx, productId);
    return deleted;
  });

  if (!result) {
    return c.json({ error: { message: "Variant not found", status: 404 } }, 404);
  }

  return c.json({ data: { id: result.id, deleted: true } });
});

// --- Mass price recalculation ---

/**
 * POST /products/recalculate-bs — Recalculate all Bs prices using the current BCV rate.
 *
 * For every product (and variant) that has a priceUsd, computes priceBs = priceUsd * rate.
 * Uses the latest exchange rate from the exchange_rates table.
 * Returns the number of products and variants updated.
 */
productRoutes.post("/recalculate-bs", async (c) => {
  const tenantId = c.get("tenantId")!;
  const db = getDb();

  // Get the latest BCV rate.
  const { exchangeRates } = await import("../db/schema/tenants.js");
  const [latestRate] = await db
    .select({ rate: exchangeRates.rate, effectiveAt: exchangeRates.effectiveAt })
    .from(exchangeRates)
    .orderBy(desc(exchangeRates.effectiveAt))
    .limit(1);

  if (!latestRate) {
    return c.json(
      {
        error: {
          message: "No hay tasa de cambio disponible. Espera a que se actualice.",
          status: 404,
        },
      },
      404,
    );
  }

  const rate = parseFloat(latestRate.rate);

  // Update all products with a priceUsd.
  const updatedProducts = await db
    .update(products)
    .set({
      priceBs: sql`ROUND(${products.priceUsd}::numeric * ${rate}, 2)::text`,
    })
    .where(and(eq(products.tenantId, tenantId), sql`${products.priceUsd} IS NOT NULL`))
    .returning({ id: products.id });

  // Update all variants with a priceUsd.
  const updatedVariants = await db
    .update(productVariants)
    .set({
      priceBs: sql`ROUND(${productVariants.priceUsd}::numeric * ${rate}, 2)::text`,
    })
    .where(
      and(eq(productVariants.tenantId, tenantId), sql`${productVariants.priceUsd} IS NOT NULL`),
    )
    .returning({ id: productVariants.id });

  return c.json({
    data: {
      rate: rate.toFixed(2),
      rateDate: latestRate.effectiveAt,
      productsUpdated: updatedProducts.length,
      variantsUpdated: updatedVariants.length,
    },
  });
});

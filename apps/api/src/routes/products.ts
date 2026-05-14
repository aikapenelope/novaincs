import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { products, productVariants, categories } from "../db/schema/products.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";

export const productRoutes = new Hono<AppEnv>();

// All product routes require auth + tenant context.
productRoutes.use("*", authMiddleware, tenantMiddleware);

// --- Schemas ---

const createProductSchema = z.object({
  name: z.string().min(1).max(500),
  slug: z
    .string()
    .min(1)
    .max(500)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().nullish(),
  priceUsd: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .nullish(),
  priceBs: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .nullish(),
  costUsd: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .nullish(),
  sku: z.string().max(100).nullish(),
  categoryId: z.string().uuid().nullish(),
  stock: z.number().int().min(0).default(0),
  status: z.enum(["active", "draft", "archived"]).default("active"),
  images: z.array(z.unknown()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

const updateProductSchema = createProductSchema.partial().omit({ slug: true });

const listProductsSchema = z.object({
  status: z.enum(["active", "draft", "archived"]).optional(),
  categoryId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createVariantSchema = z.object({
  name: z.string().min(1).max(255),
  sku: z.string().max(100).nullish(),
  priceUsd: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .nullish(),
  priceBs: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .nullish(),
  costUsd: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .nullish(),
  stock: z.number().int().min(0).default(0),
  options: z.record(z.string()).default({}),
  sortOrder: z.number().int().default(0),
});

// --- Routes ---

/**
 * GET /products — List products for the current tenant.
 * Supports filtering by status and categoryId, with pagination.
 */
productRoutes.get("/", zValidator("query", listProductsSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const query = c.req.valid("query");
  const db = getDb();

  const conditions = [eq(products.tenantId, tenantId)];
  if (query.status) conditions.push(eq(products.status, query.status));
  if (query.categoryId) conditions.push(eq(products.categoryId, query.categoryId));

  const rows = await db
    .select()
    .from(products)
    .where(and(...conditions))
    .orderBy(desc(products.createdAt))
    .limit(query.limit)
    .offset(query.offset);

  return c.json({ data: rows });
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

  // Fetch variants if the product has them.
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

  // Verify product exists and belongs to tenant.
  const [existing] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: { message: "Product not found", status: 404 } }, 404);
  }

  // Build update object from provided fields only.
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

// --- Variant sub-routes ---

/**
 * POST /products/:id/variants — Add a variant to a product.
 * Automatically sets hasVariants=true on the parent product.
 */
productRoutes.post("/:id/variants", zValidator("json", createVariantSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const productId = c.req.param("id");
  const body = c.req.valid("json");
  const db = getDb();

  // Verify product exists.
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.tenantId, tenantId)))
    .limit(1);

  if (!product) {
    return c.json({ error: { message: "Product not found", status: 404 } }, 404);
  }

  const result = await db.transaction(async (tx) => {
    // Create the variant.
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
        sortOrder: body.sortOrder,
      })
      .returning();

    // Mark parent product as having variants and recalculate total stock.
    const stockResult = await tx
      .select({ total: sql<number>`COALESCE(SUM(${productVariants.stock}), 0)` })
      .from(productVariants)
      .where(and(eq(productVariants.productId, productId), eq(productVariants.status, "active")));

    const totalStock = Number(stockResult[0]?.total ?? 0);

    await tx
      .update(products)
      .set({ hasVariants: true, stock: totalStock })
      .where(eq(products.id, productId));

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

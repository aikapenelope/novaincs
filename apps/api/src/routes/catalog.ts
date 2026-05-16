import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, ilike, count, sql } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { tenants, paymentConfigs } from "../db/schema/tenants.js";
import { products, productVariants } from "../db/schema/products.js";

/**
 * Public catalog routes — no auth required.
 *
 * All routes are scoped to a tenant via the :tenantSlug URL parameter.
 * Used by the catalog PWA to display products and checkout.
 */
export const catalogRoutes = new Hono<AppEnv>();

// --- Helpers ---

async function resolveTenant(slug: string) {
  const db = getDb();
  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      description: tenants.description,
      logoUrl: tenants.logoUrl,
      settings: tenants.settings,
    })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  return tenant ?? null;
}

// --- Routes ---

/**
 * GET /catalog/:tenantSlug — Get store info.
 */
catalogRoutes.get("/:tenantSlug", async (c) => {
  const tenant = await resolveTenant(c.req.param("tenantSlug"));
  if (!tenant) {
    return c.json({ error: { message: "Store not found", status: 404 } }, 404);
  }
  return c.json({ data: tenant });
});

/**
 * GET /catalog/:tenantSlug/products — List active products.
 */
const listSchema = z.object({
  search: z.string().max(200).optional(),
  categoryId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

catalogRoutes.get("/:tenantSlug/products", zValidator("query", listSchema), async (c) => {
  const tenant = await resolveTenant(c.req.param("tenantSlug"));
  if (!tenant) {
    return c.json({ error: { message: "Store not found", status: 404 } }, 404);
  }

  const query = c.req.valid("query");
  const db = getDb();

  const conditions = [eq(products.tenantId, tenant.id), eq(products.status, "active")];
  if (query.categoryId) conditions.push(eq(products.categoryId, query.categoryId));
  if (query.search) {
    // Full-text search on name + description using Spanish dictionary.
    // Falls back to ILIKE for single-character queries.
    if (query.search.length >= 3) {
      const tsQuery = query.search
        .trim()
        .split(/\s+/)
        .map((w) => `${w}:*`)
        .join(" & ");
      conditions.push(
        sql`to_tsvector('spanish', coalesce(${products.name}, '') || ' ' || coalesce(${products.description}, '')) @@ to_tsquery('spanish', ${tsQuery})`,
      );
    } else {
      conditions.push(ilike(products.name, `%${query.search}%`));
    }
  }

  const where = and(...conditions);

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
 * GET /catalog/:tenantSlug/products/:slug — Get a single product by slug.
 */
catalogRoutes.get("/:tenantSlug/products/:slug", async (c) => {
  const tenant = await resolveTenant(c.req.param("tenantSlug"));
  if (!tenant) {
    return c.json({ error: { message: "Store not found", status: 404 } }, 404);
  }

  const db = getDb();
  const slug = c.req.param("slug");

  const [product] = await db
    .select()
    .from(products)
    .where(
      and(eq(products.tenantId, tenant.id), eq(products.slug, slug), eq(products.status, "active")),
    )
    .limit(1);

  if (!product) {
    return c.json({ error: { message: "Product not found", status: 404 } }, 404);
  }

  let variants: (typeof productVariants.$inferSelect)[] = [];
  if (product.hasVariants) {
    variants = await db
      .select()
      .from(productVariants)
      .where(and(eq(productVariants.productId, product.id), eq(productVariants.status, "active")))
      .orderBy(productVariants.sortOrder);
  }

  return c.json({ data: { ...product, variants } });
});

/**
 * GET /catalog/:tenantSlug/payment-methods — Get active payment methods.
 *
 * Returns the merchant's configured payment methods (Pago Movil bank details,
 * Zelle email, etc.) so the checkout can display them to the buyer.
 */
catalogRoutes.get("/:tenantSlug/payment-methods", async (c) => {
  const tenant = await resolveTenant(c.req.param("tenantSlug"));
  if (!tenant) {
    return c.json({ error: { message: "Store not found", status: 404 } }, 404);
  }

  const db = getDb();
  const configs = await db
    .select({
      method: paymentConfigs.method,
      label: paymentConfigs.label,
      details: paymentConfigs.details,
    })
    .from(paymentConfigs)
    .where(and(eq(paymentConfigs.tenantId, tenant.id), eq(paymentConfigs.isActive, "true")))
    .orderBy(paymentConfigs.sortOrder);

  return c.json({ data: configs });
});

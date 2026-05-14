import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, asc, isNull } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { categories } from "../db/schema/products.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";

export const categoryRoutes = new Hono<AppEnv>();

// All category routes require auth + tenant context.
categoryRoutes.use("*", authMiddleware, tenantMiddleware);

// --- Schemas ---

const createCategorySchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().nullish(),
  imageUrl: z.string().url().nullish(),
  parentId: z.string().uuid().nullish(),
  sortOrder: z.number().int().default(0),
});

const updateCategorySchema = createCategorySchema.partial().omit({ slug: true });

// --- Routes ---

/**
 * GET /categories — List all categories for the current tenant.
 * Returns a flat list ordered by sortOrder. The frontend builds the tree
 * using parentId references.
 */
categoryRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId")!;
  const db = getDb();

  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.tenantId, tenantId))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return c.json({ data: rows });
});

/**
 * GET /categories/tree — List top-level categories (parentId IS NULL).
 * Useful for the catalog navigation bar.
 */
categoryRoutes.get("/tree", async (c) => {
  const tenantId = c.get("tenantId")!;
  const db = getDb();

  const roots = await db
    .select()
    .from(categories)
    .where(and(eq(categories.tenantId, tenantId), isNull(categories.parentId)))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return c.json({ data: roots });
});

/**
 * GET /categories/:id — Get a single category.
 */
categoryRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const categoryId = c.req.param("id");
  const db = getDb();

  const [category] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.tenantId, tenantId)))
    .limit(1);

  if (!category) {
    return c.json({ error: { message: "Category not found", status: 404 } }, 404);
  }

  return c.json({ data: category });
});

/**
 * POST /categories — Create a new category.
 */
categoryRoutes.post("/", zValidator("json", createCategorySchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const body = c.req.valid("json");
  const db = getDb();

  // Check slug uniqueness within tenant.
  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.tenantId, tenantId), eq(categories.slug, body.slug)))
    .limit(1);

  if (existing) {
    return c.json({ error: { message: "Category slug already exists", status: 409 } }, 409);
  }

  // If parentId is provided, verify it exists and belongs to this tenant.
  if (body.parentId) {
    const [parent] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, body.parentId), eq(categories.tenantId, tenantId)))
      .limit(1);

    if (!parent) {
      return c.json({ error: { message: "Parent category not found", status: 400 } }, 400);
    }
  }

  const [category] = await db
    .insert(categories)
    .values({
      tenantId,
      name: body.name,
      slug: body.slug,
      description: body.description ?? null,
      imageUrl: body.imageUrl ?? null,
      parentId: body.parentId ?? null,
      sortOrder: body.sortOrder,
    })
    .returning();

  return c.json({ data: category }, 201);
});

/**
 * PATCH /categories/:id — Update a category.
 */
categoryRoutes.patch("/:id", zValidator("json", updateCategorySchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const categoryId = c.req.param("id");
  const body = c.req.valid("json");
  const db = getDb();

  const [existing] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: { message: "Category not found", status: 404 } }, 404);
  }

  // Prevent setting parentId to self (circular reference).
  if (body.parentId === categoryId) {
    return c.json({ error: { message: "Category cannot be its own parent", status: 400 } }, 400);
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl;
  if (body.parentId !== undefined) updates.parentId = body.parentId;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: { message: "No fields to update", status: 400 } }, 400);
  }

  const [updated] = await db
    .update(categories)
    .set(updates)
    .where(and(eq(categories.id, categoryId), eq(categories.tenantId, tenantId)))
    .returning();

  return c.json({ data: updated });
});

/**
 * DELETE /categories/:id — Delete a category.
 * Products in this category will have their categoryId set to NULL (ON DELETE SET NULL).
 */
categoryRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const categoryId = c.req.param("id");
  const db = getDb();

  const [deleted] = await db
    .delete(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.tenantId, tenantId)))
    .returning({ id: categories.id });

  if (!deleted) {
    return c.json({ error: { message: "Category not found", status: 404 } }, 404);
  }

  return c.json({ data: { id: deleted.id, deleted: true } });
});

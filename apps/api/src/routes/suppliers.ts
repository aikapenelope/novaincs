import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql, ilike, count } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { suppliers } from "../db/schema/erp.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";

export const supplierRoutes = new Hono<AppEnv>();

supplierRoutes.use("*", authMiddleware, tenantMiddleware);

const createSupplierSchema = z.object({
  name: z.string().min(1).max(255),
  contactName: z.string().max(255).nullish(),
  phone: z.string().max(50).nullish(),
  email: z.string().email().max(255).nullish(),
  rif: z.string().max(50).nullish(),
  address: z.string().max(1000).nullish(),
  productsSupplied: z.string().max(2000).nullish(),
  notes: z.string().max(5000).nullish(),
});

const listSchema = z.object({
  search: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

supplierRoutes.get("/", zValidator("query", listSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { search, limit, offset } = c.req.valid("query");
  const db = getDb();

  const conditions = [eq(suppliers.tenantId, tenantId)];
  if (search) conditions.push(ilike(suppliers.name, `%${search}%`));

  const where = and(...conditions);
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(suppliers)
      .where(where)
      .orderBy(desc(suppliers.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(suppliers).where(where),
  ]);

  return c.json({ data: rows, total: total?.total ?? 0 });
});

supplierRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");
  const db = getDb();

  const [supplier] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId)))
    .limit(1);

  if (!supplier) return c.json({ error: { message: "Supplier not found", status: 404 } }, 404);
  return c.json({ data: supplier });
});

supplierRoutes.post("/", zValidator("json", createSupplierSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const body = c.req.valid("json");
  const db = getDb();

  const [supplier] = await db
    .insert(suppliers)
    .values({
      tenantId,
      name: body.name,
      contactName: body.contactName ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      rif: body.rif ?? null,
      address: body.address ?? null,
      productsSupplied: body.productsSupplied ?? null,
      notes: body.notes ?? null,
    })
    .returning();

  return c.json({ data: supplier }, 201);
});

supplierRoutes.patch("/:id", zValidator("json", createSupplierSchema.partial()), async (c) => {
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const db = getDb();

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.contactName !== undefined) updates.contactName = body.contactName;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.email !== undefined) updates.email = body.email;
  if (body.rif !== undefined) updates.rif = body.rif;
  if (body.address !== undefined) updates.address = body.address;
  if (body.productsSupplied !== undefined) updates.productsSupplied = body.productsSupplied;
  if (body.notes !== undefined) updates.notes = body.notes;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: { message: "No fields to update", status: 400 } }, 400);
  }

  const [updated] = await db
    .update(suppliers)
    .set(updates)
    .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: { message: "Supplier not found", status: 404 } }, 404);
  return c.json({ data: updated });
});

supplierRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");
  const db = getDb();

  const [deleted] = await db
    .delete(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.tenantId, tenantId)))
    .returning({ id: suppliers.id });

  if (!deleted) return c.json({ error: { message: "Supplier not found", status: 404 } }, 404);
  return c.json({ data: { id: deleted.id, deleted: true } });
});

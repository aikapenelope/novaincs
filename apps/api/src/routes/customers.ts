import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql, ilike, count, or, isNotNull } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { customers, customerEvents } from "../db/schema/customers.js";
import { orders } from "../db/schema/orders.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";
import { runRfmScoring } from "../services/rfm-scoring.js";

export const customerRoutes = new Hono<AppEnv>();

// All customer routes require auth + tenant context.
customerRoutes.use("*", authMiddleware, tenantMiddleware);

// --- Schemas ---

const listCustomersSchema = z.object({
  search: z.string().max(200).optional(),
  segment: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const updateCustomerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  phone: z.string().max(50).nullish(),
  email: z.string().email().max(255).nullish(),
  deliveryZone: z.string().max(255).nullish(),
  preferredPaymentMethod: z.string().max(50).nullish(),
  notes: z.string().max(5000).nullish(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

const addNoteSchema = z.object({
  note: z.string().min(1).max(5000),
});

const updateTagsSchema = z.object({
  tags: z.array(z.string().max(50)).max(20),
});

// --- Routes ---

/**
 * GET /customers — List customers for the current tenant.
 * Supports search by name/phone, filtering by segment, and pagination.
 */
customerRoutes.get("/", zValidator("query", listCustomersSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const query = c.req.valid("query");
  const db = getDb();

  const conditions = [eq(customers.tenantId, tenantId)];
  if (query.segment) conditions.push(eq(customers.segment, query.segment));
  if (query.search) {
    conditions.push(
      or(ilike(customers.name, `%${query.search}%`), ilike(customers.phone, `%${query.search}%`))!,
    );
  }

  const where = and(...conditions);

  const [rows, [countResult]] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(where)
      .orderBy(desc(customers.lastPurchaseAt), desc(customers.createdAt))
      .limit(query.limit)
      .offset(query.offset),
    db.select({ total: count() }).from(customers).where(where),
  ]);

  return c.json({
    data: rows,
    total: countResult?.total ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
});

/**
 * GET /customers/:id — Get a single customer with their order history and timeline.
 *
 * Returns the customer profile, recent orders, and recent events.
 * This is the "customer detail card" for the CRM.
 */
customerRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const customerId = c.req.param("id");
  const db = getDb();

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: { message: "Customer not found", status: 404 } }, 404);
  }

  // Fetch recent orders and events in parallel.
  const [recentOrders, recentEvents] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(and(eq(orders.customerId, customerId), eq(orders.tenantId, tenantId)))
      .orderBy(desc(orders.createdAt))
      .limit(20),
    db
      .select()
      .from(customerEvents)
      .where(and(eq(customerEvents.customerId, customerId), eq(customerEvents.tenantId, tenantId)))
      .orderBy(desc(customerEvents.createdAt))
      .limit(50),
  ]);

  return c.json({
    data: {
      ...customer,
      recentOrders,
      recentEvents,
    },
  });
});

/**
 * PATCH /customers/:id — Update a customer's profile.
 */
customerRoutes.patch("/:id", zValidator("json", updateCustomerSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const customerId = c.req.param("id");
  const body = c.req.valid("json");
  const db = getDb();

  const [existing] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: { message: "Customer not found", status: 404 } }, 404);
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.phone !== undefined) updates.phone = body.phone;
  if (body.email !== undefined) updates.email = body.email;
  if (body.deliveryZone !== undefined) updates.deliveryZone = body.deliveryZone;
  if (body.preferredPaymentMethod !== undefined)
    updates.preferredPaymentMethod = body.preferredPaymentMethod;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.tags !== undefined) updates.tags = body.tags;

  if (Object.keys(updates).length === 0) {
    return c.json({ error: { message: "No fields to update", status: 400 } }, 400);
  }

  const [updated] = await db
    .update(customers)
    .set(updates)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .returning();

  return c.json({ data: updated });
});

/**
 * PATCH /customers/:id/notes — Append a note to a customer.
 * Appends to the existing notes field with a timestamp separator.
 */
customerRoutes.patch("/:id/notes", zValidator("json", addNoteSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const customerId = c.req.param("id");
  const body = c.req.valid("json");
  const db = getDb();

  const [customer] = await db
    .select({ id: customers.id, notes: customers.notes })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: { message: "Customer not found", status: 404 } }, 404);
  }

  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const newNote = `[${timestamp}] ${body.note}`;
  const updatedNotes = customer.notes ? `${customer.notes}\n${newNote}` : newNote;

  const [updated] = await db
    .update(customers)
    .set({ notes: updatedNotes })
    .where(eq(customers.id, customerId))
    .returning();

  return c.json({ data: updated });
});

/**
 * PUT /customers/:id/tags — Replace all tags on a customer.
 */
customerRoutes.put("/:id/tags", zValidator("json", updateTagsSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const customerId = c.req.param("id");
  const body = c.req.valid("json");
  const db = getDb();

  const [existing] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: { message: "Customer not found", status: 404 } }, 404);
  }

  const [updated] = await db
    .update(customers)
    .set({ tags: body.tags })
    .where(eq(customers.id, customerId))
    .returning();

  return c.json({ data: updated });
});

/**
 * GET /customers/:id/timeline — Get the full event timeline for a customer.
 * Paginated, most recent first.
 */
customerRoutes.get("/:id/timeline", async (c) => {
  const tenantId = c.get("tenantId")!;
  const customerId = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const offset = Number(c.req.query("offset") ?? 0);
  const db = getDb();

  // Verify customer belongs to tenant.
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId)))
    .limit(1);

  if (!customer) {
    return c.json({ error: { message: "Customer not found", status: 404 } }, 404);
  }

  const [events, [countResult]] = await Promise.all([
    db
      .select()
      .from(customerEvents)
      .where(and(eq(customerEvents.customerId, customerId), eq(customerEvents.tenantId, tenantId)))
      .orderBy(desc(customerEvents.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(customerEvents)
      .where(and(eq(customerEvents.customerId, customerId), eq(customerEvents.tenantId, tenantId))),
  ]);

  return c.json({
    data: events,
    total: countResult?.total ?? 0,
    limit,
    offset,
  });
});

/**
 * GET /customers/stats — Aggregate CRM stats for the current tenant.
 * Returns total customers, segments breakdown, and top customers.
 */
customerRoutes.get("/stats", async (c) => {
  const tenantId = c.get("tenantId")!;
  const db = getDb();

  const [totalResult, segmentRows, topCustomers] = await Promise.all([
    db.select({ total: count() }).from(customers).where(eq(customers.tenantId, tenantId)),
    db
      .select({
        segment: customers.segment,
        count: count(),
      })
      .from(customers)
      .where(eq(customers.tenantId, tenantId))
      .groupBy(customers.segment),
    db
      .select()
      .from(customers)
      .where(eq(customers.tenantId, tenantId))
      .orderBy(sql`${customers.lifetimeValue}::numeric DESC`)
      .limit(10),
  ]);

  return c.json({
    data: {
      totalCustomers: totalResult[0]?.total ?? 0,
      segments: segmentRows.reduce(
        (acc, row) => {
          acc[row.segment ?? "unclassified"] = row.count;
          return acc;
        },
        {} as Record<string, number>,
      ),
      topCustomers,
    },
  });
});

/**
 * GET /customers/segments — List customers grouped by segment.
 * Returns each segment with its customer count and average LTV.
 */
customerRoutes.get("/segments", async (c) => {
  const tenantId = c.get("tenantId")!;
  const db = getDb();

  const segmentData = await db
    .select({
      segment: customers.segment,
      count: count(),
      avgLifetimeValue: sql<string>`ROUND(AVG(${customers.lifetimeValue}::numeric), 2)::text`,
      avgOrders: sql<string>`ROUND(AVG(${customers.totalOrders}), 1)::text`,
    })
    .from(customers)
    .where(eq(customers.tenantId, tenantId))
    .groupBy(customers.segment)
    .orderBy(sql`count(*) DESC`);

  return c.json({
    data: segmentData.map((row) => ({
      segment: row.segment ?? "unclassified",
      count: row.count,
      avgLifetimeValue: row.avgLifetimeValue,
      avgOrders: row.avgOrders,
    })),
  });
});

/**
 * GET /customers/at-risk — List customers in at_risk or hibernating segments.
 * These are the customers the merchant should focus on re-engaging.
 */
customerRoutes.get("/at-risk", async (c) => {
  const tenantId = c.get("tenantId")!;
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
  const offset = Number(c.req.query("offset") ?? 0);
  const db = getDb();

  const atRiskSegments = ["at_risk", "hibernating", "one_timer"];

  const [rows, [countResult]] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(
        and(eq(customers.tenantId, tenantId), sql`${customers.segment} = ANY(${atRiskSegments})`),
      )
      .orderBy(sql`${customers.lifetimeValue}::numeric DESC`)
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(customers)
      .where(
        and(eq(customers.tenantId, tenantId), sql`${customers.segment} = ANY(${atRiskSegments})`),
      ),
  ]);

  return c.json({
    data: rows,
    total: countResult?.total ?? 0,
    limit,
    offset,
  });
});

/**
 * POST /customers/rfm/recalculate — Trigger an immediate RFM recalculation.
 * Useful after bulk imports or when the merchant wants fresh segments.
 * Rate-limited to prevent abuse (the cron runs every 6h automatically).
 */
customerRoutes.post("/rfm/recalculate", async (c) => {
  const result = await runRfmScoring();
  return c.json({
    data: {
      tenantsProcessed: result.tenantsProcessed,
      customersScored: result.customersScored,
    },
  });
});

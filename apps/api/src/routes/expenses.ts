import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, sql, gte, lte, count } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { expenses } from "../db/schema/erp.js";
import { orders } from "../db/schema/orders.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";

export const expenseRoutes = new Hono<AppEnv>();

expenseRoutes.use("*", authMiddleware, tenantMiddleware);

const createExpenseSchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  amountBs: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .nullish(),
  category: z.string().min(1).max(100),
  description: z.string().max(2000).nullish(),
  supplierId: z.string().uuid().nullish(),
  paymentMethod: z.string().max(50).nullish(),
  reference: z.string().max(255).nullish(),
  expenseDate: z.string().datetime().optional(),
  invoiceNumber: z.string().max(100).nullish(),
});

const listSchema = z.object({
  category: z.string().max(100).optional(),
  days: z.coerce.number().int().min(1).max(365).default(30),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

expenseRoutes.get("/", zValidator("query", listSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { category, days, limit, offset } = c.req.valid("query");
  const db = getDb();

  const since = new Date();
  since.setDate(since.getDate() - days);

  const conditions = [eq(expenses.tenantId, tenantId), gte(expenses.expenseDate, since)];
  if (category) conditions.push(eq(expenses.category, category));

  const where = and(...conditions);
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(expenses)
      .where(where)
      .orderBy(desc(expenses.expenseDate))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(expenses).where(where),
  ]);

  return c.json({ data: rows, total: total?.total ?? 0 });
});

expenseRoutes.post("/", zValidator("json", createExpenseSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const body = c.req.valid("json");
  const db = getDb();

  const [expense] = await db
    .insert(expenses)
    .values({
      tenantId,
      amount: body.amount,
      amountBs: body.amountBs ?? null,
      category: body.category,
      description: body.description ?? null,
      supplierId: body.supplierId ?? null,
      paymentMethod: body.paymentMethod ?? null,
      reference: body.reference ?? null,
      expenseDate: body.expenseDate ? new Date(body.expenseDate) : new Date(),
      invoiceNumber: body.invoiceNumber ?? null,
    })
    .returning();

  return c.json({ data: expense }, 201);
});

expenseRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");
  const db = getDb();

  const [deleted] = await db
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.tenantId, tenantId)))
    .returning({ id: expenses.id });

  if (!deleted) return c.json({ error: { message: "Expense not found", status: 404 } }, 404);
  return c.json({ data: { id: deleted.id, deleted: true } });
});

/**
 * GET /expenses/summary — P&L summary for the period.
 * Revenue (from verified orders) - Expenses = Net Profit.
 */
expenseRoutes.get(
  "/summary",
  zValidator("query", z.object({ days: z.coerce.number().int().min(1).max(365).default(30) })),
  async (c) => {
    const tenantId = c.get("tenantId")!;
    const { days } = c.req.valid("query");
    const db = getDb();

    const since = new Date();
    since.setDate(since.getDate() - days);

    const [revResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(${orders.totalUsd}::numeric), 0)::text` })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.paymentStatus, "verified"),
          gte(orders.createdAt, since),
        ),
      );

    const [expResult] = await db
      .select({ total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)::text` })
      .from(expenses)
      .where(and(eq(expenses.tenantId, tenantId), gte(expenses.expenseDate, since)));

    // Category breakdown
    const categoryBreakdown = await db
      .select({
        category: expenses.category,
        total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)::text`,
        count: count(),
      })
      .from(expenses)
      .where(and(eq(expenses.tenantId, tenantId), gte(expenses.expenseDate, since)))
      .groupBy(expenses.category)
      .orderBy(sql`SUM(${expenses.amount}::numeric) DESC`);

    const revenue = Number.parseFloat(revResult?.total ?? "0");
    const totalExpenses = Number.parseFloat(expResult?.total ?? "0");
    const netProfit = revenue - totalExpenses;
    const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return c.json({
      data: {
        period: { days },
        revenue: revenue.toFixed(2),
        expenses: totalExpenses.toFixed(2),
        netProfit: netProfit.toFixed(2),
        profitMargin: Math.round(profitMargin * 10) / 10,
        categories: categoryBreakdown.map((r) => ({
          category: r.category,
          total: r.total,
          count: r.count,
        })),
      },
    });
  },
);

/**
 * GET /expenses/categories — List distinct expense categories for the tenant.
 */
expenseRoutes.get("/categories", async (c) => {
  const tenantId = c.get("tenantId")!;
  const db = getDb();

  const categories = await db
    .select({ category: expenses.category, count: count() })
    .from(expenses)
    .where(eq(expenses.tenantId, tenantId))
    .groupBy(expenses.category)
    .orderBy(sql`count(*) DESC`);

  return c.json({ data: categories });
});

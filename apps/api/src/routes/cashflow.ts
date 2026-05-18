import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, sql, gte, lte, count } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { orders } from "../db/schema/orders.js";
import { expenses } from "../db/schema/erp.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";
import { requirePlanFeature } from "../middleware/plan-gate.js";

export const cashflowRoutes = new Hono<AppEnv>();

cashflowRoutes.use("*", authMiddleware, tenantMiddleware);
cashflowRoutes.use("*", requirePlanFeature("financial_dashboard"));

// --- Helpers ---

/**
 * Returns a Date set to midnight N days ago.
 * Used as the lower bound for period queries.
 */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

const periodSchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

// --- Routes ---

/**
 * GET /cashflow/summary — Cash flow summary with projections.
 *
 * Returns:
 * - Current period: total inflows (verified orders), total outflows (expenses), net cash flow
 * - Previous period comparison (same length, immediately prior)
 * - 7-day and 30-day projections based on daily averages
 *
 * Projection math:
 *   dailyAvg = totalForPeriod / days
 *   projection(N) = dailyAvg * N
 *
 * This gives a linear extrapolation. For merchants with seasonal patterns,
 * a weighted moving average would be more accurate (future improvement).
 */
cashflowRoutes.get("/summary", zValidator("query", periodSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { days } = c.req.valid("query");
  const db = getDb();

  const periodStart = daysAgo(days);
  const prevPeriodStart = daysAgo(days * 2);
  const now = new Date();

  // Run all 4 queries in parallel for performance
  const [currentInflows, currentOutflows, prevInflows, prevOutflows] = await Promise.all([
    // Current period inflows (verified orders)
    db
      .select({
        total: sql<string>`COALESCE(SUM(${orders.totalUsd}::numeric), 0)::text`,
        count: count(),
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.paymentStatus, "verified"),
          gte(orders.createdAt, periodStart),
          lte(orders.createdAt, now),
        ),
      )
      .then((r) => r[0]),

    // Current period outflows (expenses)
    db
      .select({
        total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)::text`,
        count: count(),
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.tenantId, tenantId),
          gte(expenses.expenseDate, periodStart),
          lte(expenses.expenseDate, now),
        ),
      )
      .then((r) => r[0]),

    // Previous period inflows
    db
      .select({
        total: sql<string>`COALESCE(SUM(${orders.totalUsd}::numeric), 0)::text`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.paymentStatus, "verified"),
          gte(orders.createdAt, prevPeriodStart),
          lte(orders.createdAt, periodStart),
        ),
      )
      .then((r) => r[0]),

    // Previous period outflows
    db
      .select({
        total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)::text`,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.tenantId, tenantId),
          gte(expenses.expenseDate, prevPeriodStart),
          lte(expenses.expenseDate, periodStart),
        ),
      )
      .then((r) => r[0]),
  ]);

  const inflows = parseFloat(currentInflows?.total ?? "0");
  const outflows = parseFloat(currentOutflows?.total ?? "0");
  const netCashFlow = inflows - outflows;

  const prevIn = parseFloat(prevInflows?.total ?? "0");
  const prevOut = parseFloat(prevOutflows?.total ?? "0");
  const prevNet = prevIn - prevOut;
  const netChange = prevNet !== 0 ? ((netCashFlow - prevNet) / Math.abs(prevNet)) * 100 : 0;

  // Daily averages: divide by the actual number of days in the period.
  const dailyAvgInflow = days > 0 ? inflows / days : 0;
  const dailyAvgOutflow = days > 0 ? outflows / days : 0;
  const dailyAvgNet = dailyAvgInflow - dailyAvgOutflow;

  return c.json({
    data: {
      period: { days, start: periodStart.toISOString().slice(0, 10) },
      current: {
        inflows: inflows.toFixed(2),
        outflows: outflows.toFixed(2),
        netCashFlow: netCashFlow.toFixed(2),
        inflowCount: currentInflows?.count ?? 0,
        outflowCount: currentOutflows?.count ?? 0,
      },
      previous: {
        inflows: prevIn.toFixed(2),
        outflows: prevOut.toFixed(2),
        netCashFlow: prevNet.toFixed(2),
      },
      change: {
        netPercent: Math.round(netChange * 10) / 10,
      },
      projections: {
        daily: {
          avgInflow: dailyAvgInflow.toFixed(2),
          avgOutflow: dailyAvgOutflow.toFixed(2),
          avgNet: dailyAvgNet.toFixed(2),
        },
        sevenDay: {
          projectedInflows: (dailyAvgInflow * 7).toFixed(2),
          projectedOutflows: (dailyAvgOutflow * 7).toFixed(2),
          projectedNet: (dailyAvgNet * 7).toFixed(2),
        },
        thirtyDay: {
          projectedInflows: (dailyAvgInflow * 30).toFixed(2),
          projectedOutflows: (dailyAvgOutflow * 30).toFixed(2),
          projectedNet: (dailyAvgNet * 30).toFixed(2),
        },
      },
    },
  });
});

/**
 * GET /cashflow/daily — Daily cash flow breakdown for chart.
 *
 * Returns daily inflows, outflows, and net for the requested period.
 * Fills in zero-value days so the frontend gets a continuous timeline.
 */
cashflowRoutes.get("/daily", zValidator("query", periodSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { days } = c.req.valid("query");
  const db = getDb();

  const since = daysAgo(days);

  // Run both queries in parallel
  const [dailyInflows, dailyOutflows] = await Promise.all([
    db
      .select({
        date: sql<string>`TO_CHAR(${orders.createdAt}, 'YYYY-MM-DD')`,
        total: sql<string>`COALESCE(SUM(${orders.totalUsd}::numeric), 0)::text`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.paymentStatus, "verified"),
          gte(orders.createdAt, since),
        ),
      )
      .groupBy(sql`TO_CHAR(${orders.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${orders.createdAt}, 'YYYY-MM-DD') ASC`),

    db
      .select({
        date: sql<string>`TO_CHAR(${expenses.expenseDate}, 'YYYY-MM-DD')`,
        total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)::text`,
      })
      .from(expenses)
      .where(and(eq(expenses.tenantId, tenantId), gte(expenses.expenseDate, since)))
      .groupBy(sql`TO_CHAR(${expenses.expenseDate}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${expenses.expenseDate}, 'YYYY-MM-DD') ASC`),
  ]);

  // Build lookup maps
  const inflowMap = new Map(dailyInflows.map((r) => [r.date, r.total]));
  const outflowMap = new Map(dailyOutflows.map((r) => [r.date, r.total]));

  // Generate continuous timeline with zero-fill
  const timeline: { date: string; inflows: string; outflows: string; net: string }[] = [];
  const cursor = new Date(since);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  while (cursor <= today) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const inflow = parseFloat(inflowMap.get(dateStr) ?? "0");
    const outflow = parseFloat(outflowMap.get(dateStr) ?? "0");
    timeline.push({
      date: dateStr,
      inflows: inflow.toFixed(2),
      outflows: outflow.toFixed(2),
      net: (inflow - outflow).toFixed(2),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return c.json({ data: timeline });
});

/**
 * GET /cashflow/weekly — Weekly cash flow aggregation (last 90 days).
 *
 * Returns weekly inflows, outflows, and net for bar chart visualization.
 */
cashflowRoutes.get("/weekly", async (c) => {
  const tenantId = c.get("tenantId")!;
  const db = getDb();

  const since = daysAgo(90);

  const [weeklyInflows, weeklyOutflows] = await Promise.all([
    db
      .select({
        week: sql<string>`TO_CHAR(DATE_TRUNC('week', ${orders.createdAt}), 'YYYY-MM-DD')`,
        total: sql<string>`COALESCE(SUM(${orders.totalUsd}::numeric), 0)::text`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          eq(orders.paymentStatus, "verified"),
          gte(orders.createdAt, since),
        ),
      )
      .groupBy(sql`DATE_TRUNC('week', ${orders.createdAt})`)
      .orderBy(sql`DATE_TRUNC('week', ${orders.createdAt}) ASC`),

    db
      .select({
        week: sql<string>`TO_CHAR(DATE_TRUNC('week', ${expenses.expenseDate}), 'YYYY-MM-DD')`,
        total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)::text`,
      })
      .from(expenses)
      .where(and(eq(expenses.tenantId, tenantId), gte(expenses.expenseDate, since)))
      .groupBy(sql`DATE_TRUNC('week', ${expenses.expenseDate})`)
      .orderBy(sql`DATE_TRUNC('week', ${expenses.expenseDate}) ASC`),
  ]);

  // Merge into unified weekly timeline
  const inflowMap = new Map(weeklyInflows.map((r) => [r.week, r.total]));
  const outflowMap = new Map(weeklyOutflows.map((r) => [r.week, r.total]));
  const allWeeks = new Set([...inflowMap.keys(), ...outflowMap.keys()]);
  const sortedWeeks = [...allWeeks].sort();

  const data = sortedWeeks.map((week) => {
    const inflow = parseFloat(inflowMap.get(week) ?? "0");
    const outflow = parseFloat(outflowMap.get(week) ?? "0");
    return {
      week,
      inflows: inflow.toFixed(2),
      outflows: outflow.toFixed(2),
      net: (inflow - outflow).toFixed(2),
    };
  });

  return c.json({ data });
});

/**
 * GET /cashflow/categories — Expense breakdown by category for the period.
 *
 * Returns category-level outflow breakdown for donut/pie chart.
 */
cashflowRoutes.get("/categories", zValidator("query", periodSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { days } = c.req.valid("query");
  const db = getDb();

  const since = daysAgo(days);

  const breakdown = await db
    .select({
      category: expenses.category,
      total: sql<string>`COALESCE(SUM(${expenses.amount}::numeric), 0)::text`,
      count: count(),
    })
    .from(expenses)
    .where(and(eq(expenses.tenantId, tenantId), gte(expenses.expenseDate, since)))
    .groupBy(expenses.category)
    .orderBy(sql`SUM(${expenses.amount}::numeric) DESC`);

  return c.json({
    data: breakdown.map((r) => ({
      category: r.category,
      total: r.total,
      count: r.count,
    })),
  });
});

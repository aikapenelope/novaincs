import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, sql, gte, lte, count, desc } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { orders, orderItems } from "../db/schema/orders.js";
import { products } from "../db/schema/products.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";

export const analyticsRoutes = new Hono<AppEnv>();

// All analytics routes require auth + tenant context.
analyticsRoutes.use("*", authMiddleware, tenantMiddleware);

// --- Schemas ---

const periodSchema = z.object({
  /** Number of days to look back. Defaults to 30. */
  days: z.coerce.number().int().min(1).max(365).default(30),
});

const topProductsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  days: z.coerce.number().int().min(1).max(365).default(30),
});

// --- Helpers ---

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

// --- Routes ---

/**
 * GET /analytics/revenue — Revenue over time with period comparison.
 *
 * Returns daily revenue for the requested period and the equivalent
 * previous period for comparison (e.g., last 30 days vs prior 30 days).
 * Only counts orders with verified payments.
 */
analyticsRoutes.get("/revenue", zValidator("query", periodSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { days } = c.req.valid("query");
  const db = getDb();

  const periodStart = daysAgo(days);
  const prevPeriodStart = daysAgo(days * 2);

  // Current period: daily revenue.
  const dailyRevenue = await db
    .select({
      date: sql<string>`TO_CHAR(${orders.createdAt}, 'YYYY-MM-DD')`,
      revenue: sql<string>`COALESCE(SUM(${orders.totalUsd}::numeric), 0)::text`,
      orderCount: count(),
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.paymentStatus, "verified"),
        gte(orders.createdAt, periodStart),
      ),
    )
    .groupBy(sql`TO_CHAR(${orders.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`TO_CHAR(${orders.createdAt}, 'YYYY-MM-DD') ASC`);

  // Current period totals.
  const [currentTotals] = await db
    .select({
      totalRevenue: sql<string>`COALESCE(SUM(${orders.totalUsd}::numeric), 0)::text`,
      totalOrders: count(),
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.paymentStatus, "verified"),
        gte(orders.createdAt, periodStart),
      ),
    );

  // Previous period totals (for comparison).
  const [prevTotals] = await db
    .select({
      totalRevenue: sql<string>`COALESCE(SUM(${orders.totalUsd}::numeric), 0)::text`,
      totalOrders: count(),
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.paymentStatus, "verified"),
        gte(orders.createdAt, prevPeriodStart),
        lte(orders.createdAt, periodStart),
      ),
    );

  // Weekly aggregation for bar chart.
  const weeklyRevenue = await db
    .select({
      week: sql<string>`TO_CHAR(DATE_TRUNC('week', ${orders.createdAt}), 'YYYY-MM-DD')`,
      revenue: sql<string>`COALESCE(SUM(${orders.totalUsd}::numeric), 0)::text`,
      orderCount: count(),
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.paymentStatus, "verified"),
        gte(orders.createdAt, daysAgo(90)),
      ),
    )
    .groupBy(sql`DATE_TRUNC('week', ${orders.createdAt})`)
    .orderBy(sql`DATE_TRUNC('week', ${orders.createdAt}) ASC`);

  const currentRev = parseFloat(currentTotals?.totalRevenue ?? "0");
  const prevRev = parseFloat(prevTotals?.totalRevenue ?? "0");
  const changePercent = prevRev > 0 ? ((currentRev - prevRev) / prevRev) * 100 : 0;

  return c.json({
    data: {
      period: { days, start: periodStart.toISOString().slice(0, 10) },
      current: {
        totalRevenue: currentTotals?.totalRevenue ?? "0",
        totalOrders: currentTotals?.totalOrders ?? 0,
      },
      previous: {
        totalRevenue: prevTotals?.totalRevenue ?? "0",
        totalOrders: prevTotals?.totalOrders ?? 0,
      },
      changePercent: Math.round(changePercent * 10) / 10,
      daily: dailyRevenue.map((r) => ({
        date: r.date,
        revenue: r.revenue,
        orders: r.orderCount,
      })),
      weekly: weeklyRevenue.map((r) => ({
        week: r.week,
        revenue: r.revenue,
        orders: r.orderCount,
      })),
    },
  });
});

/**
 * GET /analytics/products/top — Top products by revenue and quantity.
 *
 * Joins order_items with products to rank by total revenue and units sold.
 * Only counts items from orders with verified payments.
 */
analyticsRoutes.get("/products/top", zValidator("query", topProductsSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { limit, days } = c.req.valid("query");
  const db = getDb();

  const since = daysAgo(days);

  const topByRevenue = await db
    .select({
      productId: orderItems.productId,
      productName: orderItems.productName,
      totalRevenue: sql<string>`COALESCE(SUM(${orderItems.unitPriceUsd}::numeric * ${orderItems.quantity}), 0)::text`,
      totalQuantity: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)::text`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orderItems.tenantId, tenantId),
        eq(orders.paymentStatus, "verified"),
        gte(orders.createdAt, since),
      ),
    )
    .groupBy(orderItems.productId, orderItems.productName)
    .orderBy(sql`SUM(${orderItems.unitPriceUsd}::numeric * ${orderItems.quantity}) DESC`)
    .limit(limit);

  return c.json({
    data: topByRevenue.map((r) => ({
      productId: r.productId,
      productName: r.productName,
      totalRevenue: r.totalRevenue,
      totalQuantity: r.totalQuantity,
    })),
  });
});

/**
 * GET /analytics/margins — Product margins (requires costUsd).
 *
 * For each product that has a cost defined, calculates:
 *   - Revenue (from verified order items)
 *   - Cost (costUsd * quantity sold)
 *   - Margin (revenue - cost)
 *   - Margin % ((revenue - cost) / revenue * 100)
 */
analyticsRoutes.get("/margins", zValidator("query", topProductsSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { limit, days } = c.req.valid("query");
  const db = getDb();

  const since = daysAgo(days);

  const margins = await db
    .select({
      productId: products.id,
      productName: products.name,
      costUsd: products.costUsd,
      priceUsd: products.priceUsd,
      totalRevenue: sql<string>`COALESCE(SUM(${orderItems.unitPriceUsd}::numeric * ${orderItems.quantity}), 0)::text`,
      totalQuantity: sql<string>`COALESCE(SUM(${orderItems.quantity}), 0)::text`,
      totalCost: sql<string>`COALESCE(SUM(${products.costUsd}::numeric * ${orderItems.quantity}), 0)::text`,
    })
    .from(products)
    .innerJoin(orderItems, eq(products.id, orderItems.productId))
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(orders.paymentStatus, "verified"),
        gte(orders.createdAt, since),
        sql`${products.costUsd} IS NOT NULL`,
      ),
    )
    .groupBy(products.id, products.name, products.costUsd, products.priceUsd)
    .orderBy(sql`SUM(${orderItems.unitPriceUsd}::numeric * ${orderItems.quantity}) DESC`)
    .limit(limit);

  return c.json({
    data: margins.map((r) => {
      const revenue = parseFloat(r.totalRevenue);
      const cost = parseFloat(r.totalCost);
      const margin = revenue - cost;
      const marginPercent = revenue > 0 ? (margin / revenue) * 100 : 0;

      return {
        productId: r.productId,
        productName: r.productName,
        priceUsd: r.priceUsd,
        costUsd: r.costUsd,
        totalRevenue: r.totalRevenue,
        totalQuantity: r.totalQuantity,
        totalCost: r.totalCost,
        margin: margin.toFixed(2),
        marginPercent: Math.round(marginPercent * 10) / 10,
      };
    }),
  });
});

/**
 * GET /analytics/payment-methods — Revenue distribution by payment method.
 *
 * Returns the breakdown of verified revenue by payment method (pago_movil,
 * zelle, cash_on_delivery) for donut chart visualization.
 */
analyticsRoutes.get("/payment-methods", zValidator("query", periodSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { days } = c.req.valid("query");
  const db = getDb();

  const since = daysAgo(days);

  const breakdown = await db
    .select({
      method: orders.paymentMethod,
      revenue: sql<string>`COALESCE(SUM(${orders.totalUsd}::numeric), 0)::text`,
      orderCount: count(),
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.paymentStatus, "verified"),
        gte(orders.createdAt, since),
        sql`${orders.paymentMethod} IS NOT NULL`,
      ),
    )
    .groupBy(orders.paymentMethod)
    .orderBy(sql`SUM(${orders.totalUsd}::numeric) DESC`);

  const methodLabels: Record<string, string> = {
    pago_movil: "Pago Movil",
    zelle: "Zelle",
    cash_on_delivery: "Efectivo",
  };

  return c.json({
    data: breakdown.map((r) => ({
      method: r.method,
      label: methodLabels[r.method ?? ""] ?? r.method ?? "Otro",
      revenue: r.revenue,
      orders: r.orderCount,
    })),
  });
});

/**
 * GET /analytics/summary — High-level financial summary.
 *
 * Single endpoint that returns all key metrics for the dashboard header:
 * total revenue, orders, average order value, top product, and period comparison.
 */
analyticsRoutes.get("/summary", zValidator("query", periodSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { days } = c.req.valid("query");
  const db = getDb();

  const periodStart = daysAgo(days);
  const prevPeriodStart = daysAgo(days * 2);

  const [current] = await db
    .select({
      totalRevenue: sql<string>`COALESCE(SUM(${orders.totalUsd}::numeric), 0)::text`,
      totalOrders: count(),
      avgOrderValue: sql<string>`COALESCE(AVG(${orders.totalUsd}::numeric), 0)::text`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.paymentStatus, "verified"),
        gte(orders.createdAt, periodStart),
      ),
    );

  const [previous] = await db
    .select({
      totalRevenue: sql<string>`COALESCE(SUM(${orders.totalUsd}::numeric), 0)::text`,
      totalOrders: count(),
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.paymentStatus, "verified"),
        gte(orders.createdAt, prevPeriodStart),
        lte(orders.createdAt, periodStart),
      ),
    );

  const currentRev = parseFloat(current?.totalRevenue ?? "0");
  const prevRev = parseFloat(previous?.totalRevenue ?? "0");
  const revenueChange = prevRev > 0 ? ((currentRev - prevRev) / prevRev) * 100 : 0;

  const currentOrd = current?.totalOrders ?? 0;
  const prevOrd = previous?.totalOrders ?? 0;
  const ordersChange = prevOrd > 0 ? ((currentOrd - prevOrd) / prevOrd) * 100 : 0;

  return c.json({
    data: {
      period: { days, start: periodStart.toISOString().slice(0, 10) },
      revenue: {
        total: current?.totalRevenue ?? "0",
        change: Math.round(revenueChange * 10) / 10,
      },
      orders: {
        total: currentOrd,
        change: Math.round(ordersChange * 10) / 10,
      },
      averageOrderValue: parseFloat(current?.avgOrderValue ?? "0").toFixed(2),
    },
  });
});

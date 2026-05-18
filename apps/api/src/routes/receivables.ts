import { Hono } from "hono";
import { eq, and, sql, isNotNull, lt } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { orders } from "../db/schema/orders.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";

export const receivablesRoutes = new Hono<AppEnv>();

receivablesRoutes.use("*", authMiddleware, tenantMiddleware);

/**
 * GET /receivables — Accounts receivable summary with aging buckets.
 *
 * Groups unpaid orders by age:
 *   - 0-7 days: recent, normal
 *   - 7-15 days: follow up
 *   - 15-30 days: overdue
 *   - 30+ days: critical
 *
 * Returns totals per bucket and the list of orders in each.
 * This is pure SQL — no LLM needed.
 */
receivablesRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId")!;
  const db = getDb();
  const now = new Date();

  // Unpaid orders: payment_pending, screenshot_uploaded, verifying, or rejected.
  const unpaidStatuses = ["payment_pending", "screenshot_uploaded", "verifying", "rejected"];

  const unpaidOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      buyerName: orders.buyerName,
      buyerPhone: orders.buyerPhone,
      totalUsd: orders.totalUsd,
      status: orders.status,
      paymentStatus: orders.paymentStatus,
      expiresAt: orders.expiresAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), sql`${orders.status} = ANY(${unpaidStatuses})`))
    .orderBy(orders.createdAt);

  // Bucket orders by age.
  const buckets = {
    current: [] as typeof unpaidOrders, // 0-7 days
    followUp: [] as typeof unpaidOrders, // 7-15 days
    overdue: [] as typeof unpaidOrders, // 15-30 days
    critical: [] as typeof unpaidOrders, // 30+ days
  };

  for (const order of unpaidOrders) {
    const ageMs = now.getTime() - new Date(order.createdAt).getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

    if (ageDays <= 7) {
      buckets.current.push(order);
    } else if (ageDays <= 15) {
      buckets.followUp.push(order);
    } else if (ageDays <= 30) {
      buckets.overdue.push(order);
    } else {
      buckets.critical.push(order);
    }
  }

  const sumUsd = (list: typeof unpaidOrders) =>
    list.reduce((sum, o) => sum + Number(o.totalUsd), 0);

  return c.json({
    data: {
      summary: {
        totalUnpaid: unpaidOrders.length,
        totalUnpaidUsd: sumUsd(unpaidOrders),
        buckets: {
          current: {
            count: buckets.current.length,
            totalUsd: sumUsd(buckets.current),
            label: "0-7 dias",
          },
          followUp: {
            count: buckets.followUp.length,
            totalUsd: sumUsd(buckets.followUp),
            label: "7-15 dias",
          },
          overdue: {
            count: buckets.overdue.length,
            totalUsd: sumUsd(buckets.overdue),
            label: "15-30 dias",
          },
          critical: {
            count: buckets.critical.length,
            totalUsd: sumUsd(buckets.critical),
            label: "30+ dias",
          },
        },
      },
      orders: {
        current: buckets.current,
        followUp: buckets.followUp,
        overdue: buckets.overdue,
        critical: buckets.critical,
      },
    },
  });
});

/**
 * GET /receivables/expiring — Orders approaching stock reservation expiry.
 *
 * Returns orders with expiresAt within the next 6 hours.
 * The merchant should verify these payments soon or the stock
 * will be released by the stock-cleanup worker.
 */
receivablesRoutes.get("/expiring", async (c) => {
  const tenantId = c.get("tenantId")!;
  const db = getDb();
  const now = new Date();
  const sixHoursFromNow = new Date(now.getTime() + 6 * 60 * 60 * 1000);

  const expiringOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      buyerName: orders.buyerName,
      totalUsd: orders.totalUsd,
      status: orders.status,
      expiresAt: orders.expiresAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        isNotNull(orders.expiresAt),
        lt(orders.expiresAt, sixHoursFromNow),
        sql`${orders.status} IN ('payment_pending', 'screenshot_uploaded', 'verifying')`,
      ),
    )
    .orderBy(orders.expiresAt);

  return c.json({
    data: {
      count: expiringOrders.length,
      orders: expiringOrders,
    },
  });
});

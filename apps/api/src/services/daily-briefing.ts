/**
 * Daily Briefing service.
 *
 * Generates an AI-powered morning summary for each merchant:
 *   - Yesterday's sales (total USD + Bs, order count)
 *   - Pending payment verifications
 *   - Top 3 products by revenue
 *   - Customers at risk (from RFM segments)
 *   - Negative-margin products
 *
 * Runs as a BullMQ cron job at 8:00 AM daily. Also callable on-demand
 * via the API for the dashboard.
 *
 * Architecture:
 *   BullMQ cron → gather data from pg-nova → call Finance Agent → store briefing
 */

import { Queue, Worker } from "bullmq";
import { eq, and, gte, lt, sql, count } from "drizzle-orm";
import { getRedisConnection } from "./redis.js";
import { getDb } from "../db/index.js";
import { orders } from "../db/schema/orders.js";
import { products } from "../db/schema/products.js";
import { customers } from "../db/schema/customers.js";
import { tenants } from "../db/schema/tenants.js";

const QUEUE_NAME = "daily-briefing";
const AGENTS_URL = process.env.AGENTS_URL || "http://localhost:8100";

let _queue: Queue | null = null;
let _worker: Worker | null = null;

export interface BriefingData {
  tenantId: string;
  tenantName: string;
  date: string;
  sales: {
    totalUsd: number;
    orderCount: number;
  };
  pendingVerifications: number;
  topProducts: Array<{ name: string; revenue: number; quantity: number }>;
  atRiskCustomers: number;
  negativeMarginProducts: Array<{ name: string; priceUsd: number; costUsd: number }>;
}

export interface Briefing {
  data: BriefingData;
  summary: string;
  generatedAt: string;
}

/**
 * Gather raw data for a tenant's daily briefing.
 */
export async function gatherBriefingData(tenantId: string): Promise<BriefingData> {
  const db = getDb();

  // Yesterday's date range.
  const now = new Date();
  const yesterdayStart = new Date(now);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  yesterdayStart.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setHours(23, 59, 59, 999);

  // Get tenant name.
  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  // Yesterday's sales.
  const [salesResult] = await db
    .select({
      totalUsd: sql<string>`COALESCE(SUM(${orders.totalUsd}::numeric), 0)::text`,
      orderCount: count(),
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        gte(orders.createdAt, yesterdayStart),
        lt(orders.createdAt, yesterdayEnd),
        eq(orders.status, "verified"),
      ),
    );

  // Pending payment verifications.
  const [pendingResult] = await db
    .select({ total: count() })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        sql`${orders.status} IN ('screenshot_uploaded', 'verifying')`,
      ),
    );

  // Top 3 products by revenue (last 7 days).
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const topProducts = await db.execute(sql`
    SELECT p.name,
           SUM(oi.unit_price_usd::numeric * oi.quantity) as revenue,
           SUM(oi.quantity) as quantity
    FROM order_items oi
    JOIN products p ON p.id = oi.product_id
    JOIN orders o ON o.id = oi.order_id
    WHERE o.tenant_id = ${tenantId}
      AND o.created_at >= ${weekAgo}
      AND o.status = 'verified'
    GROUP BY p.id, p.name
    ORDER BY revenue DESC
    LIMIT 3
  `);

  // At-risk customers count.
  const [atRiskResult] = await db
    .select({ total: count() })
    .from(customers)
    .where(
      and(
        eq(customers.tenantId, tenantId),
        sql`${customers.segment} IN ('at_risk', 'hibernating')`,
      ),
    );

  // Negative-margin products.
  const negativeMargin = await db
    .select({
      name: products.name,
      priceUsd: products.priceUsd,
      costUsd: products.costUsd,
    })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.status, "active"),
        sql`${products.costUsd}::numeric > 0 AND ${products.priceUsd}::numeric < ${products.costUsd}::numeric`,
      ),
    )
    .limit(10);

  return {
    tenantId,
    tenantName: tenant?.name ?? "Unknown",
    date: yesterdayStart.toISOString().slice(0, 10),
    sales: {
      totalUsd: Number(salesResult?.totalUsd ?? 0),
      orderCount: salesResult?.orderCount ?? 0,
    },
    pendingVerifications: pendingResult?.total ?? 0,
    topProducts: (
      topProducts as unknown as Array<{ name: string; revenue: string; quantity: string }>
    ).map((r) => ({
      name: r.name,
      revenue: Number(r.revenue),
      quantity: Number(r.quantity),
    })),
    atRiskCustomers: atRiskResult?.total ?? 0,
    negativeMarginProducts: negativeMargin.map((p) => ({
      name: p.name,
      priceUsd: Number(p.priceUsd ?? 0),
      costUsd: Number(p.costUsd ?? 0),
    })),
  };
}

/**
 * Call the Finance Agent to generate a natural-language briefing.
 */
async function generateBriefingSummary(data: BriefingData): Promise<string> {
  try {
    const response = await fetch(`${AGENTS_URL}/v1/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: "nova-finance-agent",
        message: `Generate a daily briefing for ${data.tenantName} based on this data. Write in Spanish, be concise and actionable. Data: ${JSON.stringify(data)}`,
        stream: false,
      }),
    });

    if (!response.ok) {
      console.warn(`[daily-briefing] Agent returned ${response.status}, using data-only briefing`);
      return formatFallbackBriefing(data);
    }

    const result = (await response.json()) as Record<string, unknown>;
    const agentData = result?.data as Record<string, unknown> | undefined;
    const messages = result?.messages as Array<{ content?: string }> | undefined;
    return (
      (result?.content as string) ??
      (agentData?.content as string) ??
      messages?.[0]?.content ??
      formatFallbackBriefing(data)
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[daily-briefing] Agent unavailable (${message}), using fallback`);
    return formatFallbackBriefing(data);
  }
}

/**
 * Fallback briefing when the agent is unavailable.
 * Pure data, no AI — still useful for the merchant.
 */
function formatFallbackBriefing(data: BriefingData): string {
  const lines = [
    `## Resumen del ${data.date}`,
    "",
    `**Ventas**: $${data.sales.totalUsd.toFixed(2)} (${data.sales.orderCount} ordenes)`,
    `**Pagos pendientes**: ${data.pendingVerifications}`,
  ];

  if (data.topProducts.length > 0) {
    lines.push("", "**Top productos (7 dias)**:");
    for (const p of data.topProducts) {
      lines.push(`- ${p.name}: $${p.revenue.toFixed(2)} (${p.quantity} uds)`);
    }
  }

  if (data.atRiskCustomers > 0) {
    lines.push("", `**Clientes en riesgo**: ${data.atRiskCustomers}`);
  }

  if (data.negativeMarginProducts.length > 0) {
    lines.push("", "**Productos con margen negativo**:");
    for (const p of data.negativeMarginProducts) {
      lines.push(`- ${p.name}: precio $${p.priceUsd.toFixed(2)}, costo $${p.costUsd.toFixed(2)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate a briefing for a specific tenant.
 * Returns the complete briefing with data + AI summary.
 */
export async function generateBriefing(tenantId: string): Promise<Briefing> {
  const data = await gatherBriefingData(tenantId);
  const summary = await generateBriefingSummary(data);

  return {
    data,
    summary,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Run daily briefings for all active tenants.
 */
async function runDailyBriefings(): Promise<number> {
  const db = getDb();

  const allTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  let generated = 0;

  for (const tenant of allTenants) {
    try {
      await generateBriefing(tenant.id);
      generated++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[daily-briefing] Failed for tenant ${tenant.id}: ${message}`);
    }
  }

  if (generated > 0) {
    console.log(
      `[daily-briefing] Generated ${generated} briefings for ${allTenants.length} tenants`,
    );
  }

  return generated;
}

/**
 * Start the daily briefing worker.
 * Runs every day at 8:00 AM UTC (approximately 4:00 AM Venezuela time).
 */
export function startDailyBriefingWorker(): void {
  const redis = getRedisConnection();
  if (!redis) {
    console.warn("[daily-briefing] Redis unavailable, worker not started");
    return;
  }

  _queue = new Queue(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  });

  // Schedule daily at 8:00 AM UTC.
  _queue
    .add(
      "briefing",
      {},
      {
        repeat: { pattern: "0 8 * * *" },
      },
    )
    .catch(() => {});

  _worker = new Worker(
    QUEUE_NAME,
    async () => {
      await runDailyBriefings();
    },
    {
      connection: redis,
      concurrency: 1,
    },
  );

  _worker.on("failed", (_job, err) => {
    console.error(`[daily-briefing] Job failed: ${err.message}`);
  });

  console.log("[daily-briefing] Worker started (daily at 8:00 AM UTC)");
}

/**
 * Gracefully shut down the daily briefing worker.
 */
export async function stopDailyBriefingWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}

/**
 * Smart Feed generator worker.
 *
 * Runs every 30 minutes via BullMQ cron. Analyzes CRM, RFM, orders,
 * and inventory data to generate action cards for the merchant's dashboard.
 *
 * Each card type has its own generator function. Cards are deduplicated
 * by a composite key (type + entityId + date) so the same insight isn't
 * shown twice. Expired cards are cleaned up automatically.
 *
 * Card types:
 *   - at_risk_customer: Customer hasn't bought in N days (from RFM)
 *   - pending_payments: Payments waiting for verification
 *   - low_stock: Product stock below threshold
 *   - new_customer: Customer created from a recent order
 *   - cart_abandoned: Visitor abandoned cart (from cart-abandonment events)
 *   - daily_summary: Yesterday's sales summary
 */

import { Queue, Worker } from "bullmq";
import { sql, and, eq, gte, lte, lt, count } from "drizzle-orm";
import { getRedisConnection } from "./redis.js";
import { getDb } from "../db/index.js";
import { tenants } from "../db/schema/tenants.js";
import { customers } from "../db/schema/customers.js";
import { orders } from "../db/schema/orders.js";
import { products } from "../db/schema/products.js";
import { feedItems } from "../db/schema/notifications.js";

const QUEUE_NAME = "feed-generator";
const LOW_STOCK_THRESHOLD = 5;

let _queue: Queue | null = null;
let _worker: Worker | null = null;

// --- Helper: today's date string for deduplication ---

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- Helper: check if a feed item with this dedupe key already exists ---

async function dedupeExists(
  db: ReturnType<typeof getDb>,
  tenantId: string,
  dedupeKey: string,
): Promise<boolean> {
  const [existing] = await db
    .select({ id: feedItems.id })
    .from(feedItems)
    .where(and(eq(feedItems.tenantId, tenantId), eq(feedItems.dedupeKey, dedupeKey)))
    .limit(1);
  return !!existing;
}

// --- Generator: at-risk customers ---

async function generateAtRiskCards(
  db: ReturnType<typeof getDb>,
  tenantId: string,
): Promise<number> {
  const atRiskCustomers = await db
    .select({
      id: customers.id,
      name: customers.name,
      segment: customers.segment,
      lastPurchaseAt: customers.lastPurchaseAt,
      lifetimeValue: customers.lifetimeValue,
    })
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.segment, "at_risk")))
    .limit(10);

  let created = 0;
  for (const customer of atRiskCustomers) {
    const dedupeKey = `at_risk_customer:${customer.id}:${todayKey()}`;
    if (await dedupeExists(db, tenantId, dedupeKey)) continue;

    const daysSince = customer.lastPurchaseAt
      ? Math.floor(
          (Date.now() - new Date(customer.lastPurchaseAt).getTime()) / (1000 * 60 * 60 * 24),
        )
      : null;

    const daysText = daysSince !== null ? `hace ${daysSince} dias` : "sin compras recientes";

    await db.insert(feedItems).values({
      tenantId,
      type: "at_risk_customer",
      priority: "high",
      title: `${customer.name} no compra ${daysText}`,
      body: `Cliente con valor de $${customer.lifetimeValue}. Considera enviar un mensaje para reactivarlo.`,
      entityType: "customer",
      entityId: customer.id,
      actionLabel: "Ver cliente",
      actionUrl: `/customers/${customer.id}`,
      data: {
        customerName: customer.name,
        daysSinceLastPurchase: daysSince,
        ltv: customer.lifetimeValue,
      },
      dedupeKey,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    });
    created++;
  }
  return created;
}

// --- Generator: pending payments ---

async function generatePendingPaymentCards(
  db: ReturnType<typeof getDb>,
  tenantId: string,
): Promise<number> {
  const [result] = await db
    .select({ total: count() })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), eq(orders.status, "screenshot_uploaded")));

  const pendingCount = result?.total ?? 0;
  if (pendingCount === 0) return 0;

  const dedupeKey = `pending_payments:${tenantId}:${todayKey()}`;
  if (await dedupeExists(db, tenantId, dedupeKey)) return 0;

  await db.insert(feedItems).values({
    tenantId,
    type: "pending_payments",
    priority: pendingCount >= 5 ? "critical" : "high",
    title: `${pendingCount} ${pendingCount === 1 ? "pago pendiente" : "pagos pendientes"} de verificacion`,
    body: "Revisa los captures de pago para confirmar las ventas.",
    actionLabel: "Verificar pagos",
    actionUrl: "/orders?status=screenshot_uploaded",
    data: { count: pendingCount },
    dedupeKey,
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12h
  });
  return 1;
}

// --- Generator: low stock ---

async function generateLowStockCards(
  db: ReturnType<typeof getDb>,
  tenantId: string,
): Promise<number> {
  const lowStockProducts = await db
    .select({
      id: products.id,
      name: products.name,
      stock: products.stock,
    })
    .from(products)
    .where(
      and(
        eq(products.tenantId, tenantId),
        eq(products.status, "active"),
        lte(products.stock, LOW_STOCK_THRESHOLD),
        gte(products.stock, 0),
      ),
    )
    .limit(10);

  let created = 0;
  for (const product of lowStockProducts) {
    const dedupeKey = `low_stock:${product.id}:${todayKey()}`;
    if (await dedupeExists(db, tenantId, dedupeKey)) continue;

    const stockText =
      product.stock === 0
        ? "agotado"
        : `solo ${product.stock} ${product.stock === 1 ? "unidad" : "unidades"}`;

    await db.insert(feedItems).values({
      tenantId,
      type: "low_stock",
      priority: product.stock === 0 ? "critical" : "medium",
      title: `${product.name}: ${stockText}`,
      body:
        product.stock === 0
          ? "Este producto esta agotado. Los clientes no pueden comprarlo."
          : "Considera reabastecer antes de que se agote.",
      entityType: "product",
      entityId: product.id,
      actionLabel: "Ver producto",
      actionUrl: `/products/${product.id}`,
      data: { productName: product.name, stock: product.stock },
      dedupeKey,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    created++;
  }
  return created;
}

// --- Generator: new customers ---

async function generateNewCustomerCards(
  db: ReturnType<typeof getDb>,
  tenantId: string,
): Promise<number> {
  // Customers created in the last hour (since worker runs every 30 min).
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const newCustomers = await db
    .select({
      id: customers.id,
      name: customers.name,
      phone: customers.phone,
    })
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), gte(customers.createdAt, oneHourAgo)))
    .limit(10);

  let created = 0;
  for (const customer of newCustomers) {
    const dedupeKey = `new_customer:${customer.id}`;
    if (await dedupeExists(db, tenantId, dedupeKey)) continue;

    await db.insert(feedItems).values({
      tenantId,
      type: "new_customer",
      priority: "low",
      title: `Nuevo cliente: ${customer.name}`,
      body: customer.phone ? `Telefono: ${customer.phone}` : undefined,
      entityType: "customer",
      entityId: customer.id,
      actionLabel: "Ver perfil",
      actionUrl: `/customers/${customer.id}`,
      data: { customerName: customer.name },
      dedupeKey,
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h
    });
    created++;
  }
  return created;
}

// --- Cleanup: remove expired and old dismissed items ---

async function cleanupExpiredItems(db: ReturnType<typeof getDb>): Promise<number> {
  const now = new Date();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Delete expired items.
  const expired = await db
    .delete(feedItems)
    .where(and(lte(feedItems.expiresAt, now), sql`${feedItems.expiresAt} IS NOT NULL`))
    .returning({ id: feedItems.id });

  // Delete dismissed items older than 30 days.
  const dismissed = await db
    .delete(feedItems)
    .where(and(eq(feedItems.isDismissed, true), lt(feedItems.createdAt, thirtyDaysAgo)))
    .returning({ id: feedItems.id });

  return expired.length + dismissed.length;
}

// --- Main generator ---

export async function generateFeedItems(): Promise<number> {
  const db = getDb();

  // Get all active tenants.
  const allTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"))
    .limit(1000);

  let totalCreated = 0;

  for (const tenant of allTenants) {
    const atRisk = await generateAtRiskCards(db, tenant.id);
    const pending = await generatePendingPaymentCards(db, tenant.id);
    const lowStock = await generateLowStockCards(db, tenant.id);
    const newCust = await generateNewCustomerCards(db, tenant.id);
    totalCreated += atRisk + pending + lowStock + newCust;
  }

  const cleaned = await cleanupExpiredItems(db);

  if (totalCreated > 0 || cleaned > 0) {
    console.log(
      `[feed-generator] Created ${totalCreated} feed items, cleaned ${cleaned} expired/dismissed`,
    );
  }

  return totalCreated;
}

// --- Worker lifecycle ---

export function startFeedGeneratorWorker(): void {
  const redis = getRedisConnection();
  if (!redis) {
    console.warn("[feed-generator] Redis unavailable, worker not started");
    return;
  }

  _queue = new Queue(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  });

  // Run every 30 minutes.
  _queue.add("generate", {}, { repeat: { every: 30 * 60 * 1000 } }).catch(() => {});

  _worker = new Worker(
    QUEUE_NAME,
    async () => {
      await generateFeedItems();
    },
    {
      connection: redis,
      concurrency: 1,
    },
  );

  _worker.on("failed", (_job, err) => {
    console.error(`[feed-generator] Job failed: ${err.message}`);
  });

  console.log("[feed-generator] Worker started (every 30 min)");
}

export async function stopFeedGeneratorWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}

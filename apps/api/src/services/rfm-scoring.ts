/**
 * RFM Scoring Engine.
 *
 * Calculates Recency, Frequency, and Monetary scores (1-5) for every
 * customer in every tenant. Runs as a BullMQ cron job every 6 hours.
 *
 * RFM is the industry standard for customer segmentation in retail:
 *   - Recency: How recently did the customer buy? (days since last purchase)
 *   - Frequency: How often do they buy? (total orders)
 *   - Monetary: How much do they spend? (lifetime value in USD)
 *
 * Scores are calibrated per-tenant using quintiles (20th/40th/60th/80th
 * percentiles) so a merchant with 10 customers and one with 1,000 both
 * get meaningful segments. This avoids hardcoded thresholds that only
 * work for one scale.
 *
 * After scoring, each customer is assigned an auto-segment based on
 * their RFM combination (see SEGMENT_RULES below).
 */

import { Queue, Worker } from "bullmq";
import { eq, sql, isNotNull } from "drizzle-orm";
import { getRedisConnection } from "./redis.js";
import { getDb } from "../db/index.js";
import { customers } from "../db/schema/customers.js";
import { customerEvents } from "../db/schema/customers.js";
import { tenants } from "../db/schema/tenants.js";

const QUEUE_NAME = "rfm-scoring";

let _queue: Queue | null = null;
let _worker: Worker | null = null;

// --- Segment assignment rules ---

type Segment =
  | "vip"
  | "loyal"
  | "potential_loyal"
  | "at_risk"
  | "hibernating"
  | "new"
  | "one_timer"
  | "window_shopper"
  | "unclassified";

interface RfmScore {
  recency: number;
  frequency: number;
  monetary: number;
}

/**
 * Assign a segment based on RFM scores.
 *
 * Rules are evaluated top-to-bottom; first match wins.
 * Scores range from 1 (worst) to 5 (best).
 */
function assignSegment(
  rfm: RfmScore,
  totalOrders: number,
  daysSinceLastPurchase: number | null,
): Segment {
  const { recency: r, frequency: f, monetary: m } = rfm;

  // No purchases at all — window shopper (has events but no orders).
  if (totalOrders === 0) return "window_shopper";

  // Single purchase, recent — new customer.
  if (totalOrders === 1 && r >= 4) return "new";

  // Single purchase, not recent — one-timer.
  if (totalOrders === 1 && r < 4) return "one_timer";

  // High across all dimensions — VIP.
  if (r >= 4 && f >= 4 && m >= 4) return "vip";

  // Frequent and recent but not necessarily high spender — loyal.
  if (r >= 4 && f >= 3) return "loyal";

  // Recent with moderate frequency — potential loyal.
  if (r >= 3 && f >= 2) return "potential_loyal";

  // Used to buy frequently but hasn't recently — at risk.
  if (r <= 2 && f >= 3) return "at_risk";

  // Low recency and low frequency — hibernating.
  if (r <= 2 && f <= 2) return "hibernating";

  return "unclassified";
}

/**
 * Calculate quintile boundaries for an array of numbers.
 * Returns [p20, p40, p60, p80] thresholds.
 */
function quintiles(values: number[]): [number, number, number, number] {
  if (values.length === 0) return [0, 0, 0, 0];
  const sorted = [...values].sort((a, b) => a - b);
  const p = (pct: number) => sorted[Math.floor(pct * sorted.length)] ?? sorted[sorted.length - 1];
  return [p(0.2), p(0.4), p(0.6), p(0.8)];
}

/**
 * Score a value 1-5 based on quintile thresholds.
 * Higher value = higher score (for frequency and monetary).
 */
function scoreAsc(value: number, [p20, p40, p60, p80]: [number, number, number, number]): number {
  if (value <= p20) return 1;
  if (value <= p40) return 2;
  if (value <= p60) return 3;
  if (value <= p80) return 4;
  return 5;
}

/**
 * Score a value 1-5 based on quintile thresholds.
 * Lower value = higher score (for recency — fewer days = more recent = better).
 */
function scoreDesc(value: number, [p20, p40, p60, p80]: [number, number, number, number]): number {
  if (value <= p20) return 5;
  if (value <= p40) return 4;
  if (value <= p60) return 3;
  if (value <= p80) return 2;
  return 1;
}

/**
 * Run RFM scoring for all tenants.
 *
 * For each tenant:
 * 1. Fetch all customers with at least one order
 * 2. Calculate raw R/F/M values
 * 3. Compute per-tenant quintile thresholds
 * 4. Score each customer 1-5 on each dimension
 * 5. Assign segment based on RFM combination
 * 6. Update customer records
 */
export async function runRfmScoring(): Promise<{
  tenantsProcessed: number;
  customersScored: number;
}> {
  const db = getDb();
  const now = new Date();

  // Get all active tenants.
  const allTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  let totalCustomersScored = 0;

  for (const tenant of allTenants) {
    // Fetch all customers for this tenant.
    const tenantCustomers = await db
      .select({
        id: customers.id,
        totalOrders: customers.totalOrders,
        lifetimeValue: customers.lifetimeValue,
        lastPurchaseAt: customers.lastPurchaseAt,
      })
      .from(customers)
      .where(eq(customers.tenantId, tenant.id));

    if (tenantCustomers.length === 0) continue;

    // Calculate raw values.
    const rawData = tenantCustomers.map((c) => {
      const daysSinceLastPurchase = c.lastPurchaseAt
        ? Math.floor((now.getTime() - new Date(c.lastPurchaseAt).getTime()) / (1000 * 60 * 60 * 24))
        : 999; // Never purchased = very high recency (bad)

      return {
        id: c.id,
        recencyDays: daysSinceLastPurchase,
        frequency: c.totalOrders,
        monetary: Number(c.lifetimeValue),
        totalOrders: c.totalOrders,
      };
    });

    // Only compute quintiles from customers who have actually purchased.
    const purchasers = rawData.filter((c) => c.totalOrders > 0);

    if (purchasers.length === 0) {
      // All customers are window shoppers — score them all as such.
      for (const c of rawData) {
        await db
          .update(customers)
          .set({
            rfmScore: { recency: 1, frequency: 1, monetary: 1 },
            segment: "window_shopper",
          })
          .where(eq(customers.id, c.id));
        totalCustomersScored++;
      }
      continue;
    }

    // Compute per-tenant quintile thresholds.
    const recencyThresholds = quintiles(purchasers.map((c) => c.recencyDays));
    const frequencyThresholds = quintiles(purchasers.map((c) => c.frequency));
    const monetaryThresholds = quintiles(purchasers.map((c) => c.monetary));

    // Score and segment each customer.
    for (const c of rawData) {
      const rfm: RfmScore = {
        recency: c.totalOrders > 0 ? scoreDesc(c.recencyDays, recencyThresholds) : 1,
        frequency: scoreAsc(c.frequency, frequencyThresholds),
        monetary: scoreAsc(c.monetary, monetaryThresholds),
      };

      const segment = assignSegment(rfm, c.totalOrders, c.totalOrders > 0 ? c.recencyDays : null);

      await db
        .update(customers)
        .set({
          rfmScore: rfm,
          segment,
        })
        .where(eq(customers.id, c.id));

      totalCustomersScored++;
    }
  }

  if (totalCustomersScored > 0) {
    console.log(
      `[rfm-scoring] Scored ${totalCustomersScored} customers across ${allTenants.length} tenants`,
    );
  }

  return { tenantsProcessed: allTenants.length, customersScored: totalCustomersScored };
}

/**
 * Start the RFM scoring worker.
 * Runs every 6 hours. Also runs once on startup (delayed 60s to let the
 * server finish initializing).
 */
export function startRfmScoringWorker(): void {
  const redis = getRedisConnection();
  if (!redis) {
    console.warn("[rfm-scoring] Redis unavailable, worker not started");
    return;
  }

  _queue = new Queue(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 10 },
    },
  });

  // Schedule repeatable job every 6 hours.
  void _queue.add("score", {}, { repeat: { every: 6 * 60 * 60 * 1000 } });

  // Run once on startup after a 60s delay.
  void _queue.add("score-initial", {}, { delay: 60_000 });

  _worker = new Worker(
    QUEUE_NAME,
    async () => {
      await runRfmScoring();
    },
    {
      connection: redis,
      concurrency: 1,
    },
  );

  _worker.on("failed", (_job, err) => {
    console.error(`[rfm-scoring] Job failed: ${err.message}`);
  });

  console.log("[rfm-scoring] Worker started (every 6 hours)");
}

/**
 * Gracefully shut down the RFM scoring worker.
 */
export async function stopRfmScoringWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}

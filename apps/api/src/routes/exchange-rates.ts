import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { exchangeRates } from "../db/schema/tenants.js";
import { getCurrentRate, convertUsdToBs } from "../services/exchange-rate.js";

export const exchangeRateRoutes = new Hono<AppEnv>();

/**
 * GET /exchange-rates/current — Get the latest BCV exchange rate.
 *
 * Public endpoint (no auth required). Used by the catalog PWA to
 * display Bs prices alongside USD prices.
 *
 * Returns the rate, source, and when it was last updated.
 */
exchangeRateRoutes.get("/current", async (c) => {
  const rate = await getCurrentRate();

  if (!rate) {
    return c.json({ error: { message: "No exchange rate available yet", status: 503 } }, 503);
  }

  return c.json({
    data: {
      rate: rate.rate,
      source: rate.source,
      fromCurrency: "USD",
      toCurrency: "VES",
      effectiveAt: rate.effectiveAt.toISOString(),
      updatedAt: rate.createdAt.toISOString(),
    },
  });
});

/**
 * GET /exchange-rates/convert — Convert a USD amount to Bs.
 *
 * Public endpoint. Used by the catalog and checkout to show Bs totals.
 *
 * Query params:
 *   amount — USD amount to convert (e.g., "25.50")
 */
const convertSchema = z.object({
  amount: z.coerce.number().positive(),
});

exchangeRateRoutes.get("/convert", zValidator("query", convertSchema), async (c) => {
  const { amount } = c.req.valid("query");
  const bs = await convertUsdToBs(amount);

  if (bs === null) {
    return c.json({ error: { message: "No exchange rate available yet", status: 503 } }, 503);
  }

  const rate = await getCurrentRate();

  return c.json({
    data: {
      amountUsd: amount,
      amountBs: bs,
      rate: rate!.rate,
      effectiveAt: rate!.effectiveAt.toISOString(),
    },
  });
});

/**
 * GET /exchange-rates/history — Get recent exchange rate history.
 *
 * Public endpoint. Returns the last N rate entries for charting or audit.
 *
 * Query params:
 *   limit — number of entries (default 30, max 100)
 */
const historySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

exchangeRateRoutes.get("/history", zValidator("query", historySchema), async (c) => {
  const { limit } = c.req.valid("query");
  const db = getDb();

  const rows = await db
    .select({
      rate: exchangeRates.rate,
      source: exchangeRates.source,
      effectiveAt: exchangeRates.effectiveAt,
      createdAt: exchangeRates.createdAt,
    })
    .from(exchangeRates)
    .where(eq(exchangeRates.source, "bcv"))
    .orderBy(desc(exchangeRates.effectiveAt))
    .limit(limit);

  return c.json({
    data: rows.map((r) => ({
      rate: Number(r.rate),
      source: r.source,
      effectiveAt: r.effectiveAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

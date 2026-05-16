/**
 * BCV exchange rate service.
 *
 * Fetches the official USD/VES rate from ve.dolarapi.com (BCV source)
 * and stores it in the exchange_rates table. The rate is used for
 * dual pricing: merchants set prices in USD, buyers see Bs equivalent.
 *
 * API docs: https://ve.dolarapi.com
 *
 * The service exposes:
 *   - fetchAndStoreRate() — fetch from API, insert into DB, return rate
 *   - getCurrentRate()    — get the latest stored rate (no API call)
 *   - convertUsdToBs()    — helper to convert a USD amount to Bs
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { exchangeRates } from "../db/schema/tenants.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the ve.dolarapi.com /v1/dolares/oficial response. */
interface DolarApiResponse {
  moneda: string;
  fuente: string;
  nombre: string;
  compra: number | null;
  venta: number | null;
  promedio: number;
  fechaActualizacion: string;
}

export interface ExchangeRate {
  rate: number;
  source: string;
  effectiveAt: Date;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DOLARAPI_URL = "https://ve.dolarapi.com/v1/dolares/oficial";
const SOURCE_NAME = "bcv";
const FETCH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the current BCV rate from ve.dolarapi.com and store it.
 *
 * Returns the rate object, or null if the API is unreachable.
 * Deduplicates: if the rate hasn't changed since the last stored value,
 * it skips the insert and returns the existing record.
 */
export async function fetchAndStoreRate(): Promise<ExchangeRate | null> {
  let data: DolarApiResponse;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(DOLARAPI_URL, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[exchange-rate] API returned ${response.status}`);
      return null;
    }

    data = (await response.json()) as DolarApiResponse;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[exchange-rate] Failed to fetch: ${message}`);
    return null;
  }

  const rate = data.promedio;
  if (!rate || rate <= 0) {
    console.error(`[exchange-rate] Invalid rate: ${rate}`);
    return null;
  }

  const effectiveAt = new Date(data.fechaActualizacion);

  // Check if we already have this exact rate+timestamp stored.
  const db = getDb();
  const [latest] = await db
    .select()
    .from(exchangeRates)
    .where(eq(exchangeRates.source, SOURCE_NAME))
    .orderBy(desc(exchangeRates.effectiveAt))
    .limit(1);

  if (
    latest &&
    Number(latest.rate) === rate &&
    latest.effectiveAt.getTime() === effectiveAt.getTime()
  ) {
    // Rate unchanged — no need to insert a duplicate.
    return {
      rate: Number(latest.rate),
      source: latest.source,
      effectiveAt: latest.effectiveAt,
      createdAt: latest.createdAt,
    };
  }

  // Insert new rate.
  const [inserted] = await db
    .insert(exchangeRates)
    .values({
      source: SOURCE_NAME,
      fromCurrency: "USD",
      toCurrency: "VES",
      rate: String(rate),
      effectiveAt,
    })
    .returning();

  console.log(`[exchange-rate] Stored BCV rate: 1 USD = ${rate} Bs (${effectiveAt.toISOString()})`);

  return {
    rate: Number(inserted.rate),
    source: inserted.source,
    effectiveAt: inserted.effectiveAt,
    createdAt: inserted.createdAt,
  };
}

/**
 * Get the most recent stored BCV rate.
 * Returns null if no rate has been fetched yet.
 */
export async function getCurrentRate(): Promise<ExchangeRate | null> {
  const db = getDb();

  const [latest] = await db
    .select()
    .from(exchangeRates)
    .where(eq(exchangeRates.source, SOURCE_NAME))
    .orderBy(desc(exchangeRates.effectiveAt))
    .limit(1);

  if (!latest) return null;

  return {
    rate: Number(latest.rate),
    source: latest.source,
    effectiveAt: latest.effectiveAt,
    createdAt: latest.createdAt,
  };
}

/**
 * Convert a USD amount to Bs using the latest stored rate.
 * Returns null if no rate is available.
 */
export async function convertUsdToBs(amountUsd: number): Promise<number | null> {
  const rate = await getCurrentRate();
  if (!rate) return null;
  return Math.round(amountUsd * rate.rate * 100) / 100;
}

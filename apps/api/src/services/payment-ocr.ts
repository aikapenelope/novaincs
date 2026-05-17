/**
 * Payment OCR service.
 *
 * Calls the Agno Finance Agent to extract transaction details from
 * payment screenshots (Pago Movil, Zelle) via OCR.
 *
 * Architecture:
 *   Buyer uploads screenshot → API creates payment record →
 *   BullMQ job → this service calls Finance Agent → result saved to payments.ocr_data
 *
 * The OCR result includes: amount, currency, reference, bank, date,
 * payment method, confidence level, and any notes/warnings.
 *
 * If the extracted amount matches the order total and confidence is high,
 * the payment can be auto-verified (reducing merchant workload).
 */

import { Queue, Worker } from "bullmq";
import { eq } from "drizzle-orm";
import { getRedisConnection } from "./redis.js";
import { getDb } from "../db/index.js";
import { payments, orders } from "../db/schema/orders.js";

const QUEUE_NAME = "payment-ocr";
const AGENTS_URL = process.env.AGENTS_URL || "http://localhost:8100";

let _queue: Queue | null = null;
let _worker: Worker | null = null;

interface OcrJobData {
  paymentId: string;
  orderId: string;
  tenantId: string;
  screenshotUrl: string;
  expectedAmount: string;
  expectedCurrency: string;
}

interface OcrResult {
  amount: string | null;
  currency: string | null;
  reference: string | null;
  bank: string | null;
  date: string | null;
  paymentMethod: string | null;
  confidence: "high" | "medium" | "low";
  notes: string | null;
  matchesExpected: boolean;
}

/**
 * Enqueue a payment screenshot for OCR processing.
 * Called after a payment record is created.
 */
export function enqueuePaymentOcr(data: OcrJobData): boolean {
  if (!_queue) return false;

  void _queue.add("ocr", data, {
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 20 },
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
  });

  return true;
}

/**
 * Call the Agno Finance Agent to perform OCR on a screenshot.
 */
async function callFinanceAgentOcr(screenshotUrl: string): Promise<OcrResult> {
  const response = await fetch(`${AGENTS_URL}/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: "nova-finance-agent",
      message: `Analyze this payment screenshot and extract the transaction details. Return ONLY a JSON object with these fields: amount, currency (USD or VES), reference, bank, date, payment_method (pago_movil or zelle or transfer), confidence (high/medium/low), notes. Screenshot URL: ${screenshotUrl}`,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Finance Agent returned ${response.status}: ${errorText}`);
  }

  const result = (await response.json()) as Record<string, unknown>;

  // Extract the agent's response content.
  const data = result?.data as Record<string, unknown> | undefined;
  const messages = result?.messages as Array<{ content?: string }> | undefined;
  const content: string =
    typeof result === "string"
      ? result
      : ((result?.content as string) ?? (data?.content as string) ?? messages?.[0]?.content ?? "");

  // Try to parse JSON from the agent's response.
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        amount: parsed.amount ?? null,
        currency: parsed.currency ?? null,
        reference: parsed.reference ?? null,
        bank: parsed.bank ?? null,
        date: parsed.date ?? null,
        paymentMethod: parsed.payment_method ?? parsed.paymentMethod ?? null,
        confidence: parsed.confidence ?? "low",
        notes: parsed.notes ?? null,
        matchesExpected: false, // Set by the worker after comparison
      };
    }
  } catch {
    // JSON parsing failed — return raw content as notes.
  }

  return {
    amount: null,
    currency: null,
    reference: null,
    bank: null,
    date: null,
    paymentMethod: null,
    confidence: "low",
    notes: `Agent response (unparsed): ${content.slice(0, 500)}`,
    matchesExpected: false,
  };
}

/**
 * Process an OCR job: call the agent, save results, optionally auto-verify.
 */
async function processOcrJob(data: OcrJobData): Promise<void> {
  const db = getDb();

  // Update payment status to "verifying".
  await db.update(payments).set({ status: "verifying" }).where(eq(payments.id, data.paymentId));

  await db
    .update(orders)
    .set({ status: "verifying", paymentStatus: "verifying" })
    .where(eq(orders.id, data.orderId));

  // Call the Finance Agent for OCR.
  let ocrResult: OcrResult;
  try {
    ocrResult = await callFinanceAgentOcr(data.screenshotUrl);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[payment-ocr] Agent call failed for payment ${data.paymentId}: ${message}`);

    // Save the error as OCR data so the merchant can see what happened.
    await db
      .update(payments)
      .set({ ocrData: { error: message, timestamp: new Date().toISOString() } })
      .where(eq(payments.id, data.paymentId));

    return;
  }

  // Check if the extracted amount matches the expected amount.
  if (ocrResult.amount && data.expectedAmount) {
    const extracted = parseFloat(ocrResult.amount.replace(/[^0-9.]/g, ""));
    const expected = parseFloat(data.expectedAmount);
    ocrResult.matchesExpected = Math.abs(extracted - expected) < 0.01;
  }

  // Save OCR result to the payment record.
  await db
    .update(payments)
    .set({
      ocrData: {
        ...ocrResult,
        processedAt: new Date().toISOString(),
      },
    })
    .where(eq(payments.id, data.paymentId));

  // Auto-verify if confidence is high and amount matches.
  if (ocrResult.confidence === "high" && ocrResult.matchesExpected) {
    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({
          status: "verified",
          verifiedAt: new Date(),
          verifiedBy: "finance-agent",
          notes: `Auto-verified by Finance Agent (ref: ${ocrResult.reference ?? "N/A"})`,
        })
        .where(eq(payments.id, data.paymentId));

      await tx
        .update(orders)
        .set({
          status: "verified",
          paymentStatus: "verified",
          expiresAt: null,
        })
        .where(eq(orders.id, data.orderId));
    });

    console.log(
      `[payment-ocr] Auto-verified payment ${data.paymentId} (amount: ${ocrResult.amount}, ref: ${ocrResult.reference})`,
    );
  } else {
    console.log(
      `[payment-ocr] OCR complete for payment ${data.paymentId} (confidence: ${ocrResult.confidence}, matches: ${ocrResult.matchesExpected}). Awaiting merchant review.`,
    );
  }
}

/**
 * Start the payment OCR worker.
 */
export function startPaymentOcrWorker(): void {
  const redis = getRedisConnection();
  if (!redis) {
    console.warn("[payment-ocr] Redis unavailable, worker not started");
    return;
  }

  _queue = new Queue(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 20 },
    },
  });

  _worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      await processOcrJob(job.data as OcrJobData);
    },
    {
      connection: redis,
      concurrency: 2,
    },
  );

  _worker.on("failed", (job, err) => {
    console.error(`[payment-ocr] Job ${job?.id} failed: ${err.message}`);
  });

  console.log("[payment-ocr] Worker started (concurrency: 2)");
}

/**
 * Gracefully shut down the payment OCR worker.
 */
export async function stopPaymentOcrWorker(): Promise<void> {
  if (_worker) {
    await _worker.close();
    _worker = null;
  }
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}

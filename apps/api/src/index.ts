import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { startImageWorker, stopImageWorker } from "./services/image-queue.js";
import { startStockCleanupWorker, stopStockCleanupWorker } from "./services/stock-cleanup.js";
import {
  startExchangeRateWorker,
  stopExchangeRateWorker,
} from "./services/exchange-rate-worker.js";
import { startEventWorker, stopEventWorker } from "./services/event-worker.js";
import { startRfmScoringWorker, stopRfmScoringWorker } from "./services/rfm-scoring.js";
import {
  startCartAbandonmentWorker,
  stopCartAbandonmentWorker,
} from "./services/cart-abandonment.js";
import { startPaymentOcrWorker, stopPaymentOcrWorker } from "./services/payment-ocr.js";
import { startDailyBriefingWorker, stopDailyBriefingWorker } from "./services/daily-briefing.js";
import { startFeedGeneratorWorker, stopFeedGeneratorWorker } from "./services/feed-generator.js";

const port = Number(process.env.PORT) || 3000;

// Start BullMQ workers (no-op if Redis unavailable).
startImageWorker();
startStockCleanupWorker();
startExchangeRateWorker();
startEventWorker();
startRfmScoringWorker();
startCartAbandonmentWorker();
startPaymentOcrWorker();
startDailyBriefingWorker();
startFeedGeneratorWorker();

// Graceful shutdown.
const shutdown = async () => {
  console.log("Shutting down...");
  await Promise.all([
    stopImageWorker(),
    stopStockCleanupWorker(),
    stopExchangeRateWorker(),
    stopEventWorker(),
    stopRfmScoringWorker(),
    stopCartAbandonmentWorker(),
    stopPaymentOcrWorker(),
    stopDailyBriefingWorker(),
    stopFeedGeneratorWorker(),
  ]);
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Qyne API running on http://localhost:${info.port}`);
});

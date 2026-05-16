import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { startImageWorker, stopImageWorker } from "./services/image-queue.js";
import { startStockCleanupWorker, stopStockCleanupWorker } from "./services/stock-cleanup.js";

const port = Number(process.env.PORT) || 3000;

// Start BullMQ workers (no-op if Redis unavailable).
startImageWorker();
startStockCleanupWorker();

// Graceful shutdown.
const shutdown = async () => {
  console.log("Shutting down...");
  await Promise.all([stopImageWorker(), stopStockCleanupWorker()]);
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Qyne API running on http://localhost:${info.port}`);
});

import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { startImageWorker, stopImageWorker } from "./services/image-queue.js";

const port = Number(process.env.PORT) || 3000;

// Start BullMQ image processing worker (no-op if Redis unavailable).
startImageWorker();

// Graceful shutdown.
const shutdown = async () => {
  console.log("Shutting down...");
  await stopImageWorker();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Qyne API running on http://localhost:${info.port}`);
});

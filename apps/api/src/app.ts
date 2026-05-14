import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRoutes } from "./routes/health.js";

// Create the Hono app with typed environment bindings.
export type AppEnv = {
  Variables: {
    tenantId?: string;
  };
};

const app = new Hono<AppEnv>();

// --- Global middleware ---
app.use("*", logger());
app.use("*", cors());
app.onError(errorHandler);

// --- Routes ---
app.route("/", healthRoutes);

// API root
app.get("/", (c) => {
  return c.json({ name: "Qyne API", version: "0.0.0" });
});

export { app };

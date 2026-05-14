import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRoutes } from "./routes/health.js";
import { tenantRoutes } from "./routes/tenants.js";
import { productRoutes } from "./routes/products.js";
import { categoryRoutes } from "./routes/categories.js";
import { uploadRoutes } from "./routes/uploads.js";

// Create the Hono app with typed environment bindings.
export type AppEnv = {
  Variables: {
    userId?: string;
    tenantId?: string;
    memberRole?: string;
  };
};

const app = new Hono<AppEnv>();

// --- Global middleware ---
app.use("*", logger());
app.use("*", cors());
app.onError(errorHandler);

// --- Routes ---
app.route("/", healthRoutes);
app.route("/tenants", tenantRoutes);
app.route("/products", productRoutes);
app.route("/categories", categoryRoutes);
app.route("/uploads", uploadRoutes);

// Serve uploaded files in development (LocalStorageAdapter writes to .uploads/).
// In production, images are served directly from Cloudflare R2.
// The static route uses /files/* to avoid conflict with the /uploads API route.
app.use(
  "/files/*",
  serveStatic({ root: ".uploads", rewriteRequestPath: (path) => path.replace(/^\/files/, "") }),
);

// API root
app.get("/", (c) => {
  return c.json({ name: "Qyne API", version: "0.0.0" });
});

export { app };

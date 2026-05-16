import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "@hono/node-server/serve-static";
import { errorHandler } from "./middleware/error-handler.js";
import { rateLimiter } from "./middleware/rate-limit.js";
import { healthRoutes } from "./routes/health.js";
import { tenantRoutes } from "./routes/tenants.js";
import { productRoutes } from "./routes/products.js";
import { categoryRoutes } from "./routes/categories.js";
import { uploadRoutes } from "./routes/uploads.js";
import { publicOrderRoutes, orderRoutes } from "./routes/orders.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { paymentRoutes } from "./routes/payments.js";
import { exchangeRateRoutes } from "./routes/exchange-rates.js";
import { catalogRoutes } from "./routes/catalog.js";

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
app.use("*", rateLimiter({ windowMs: 60_000, maxRequests: 100 }));

// CORS: restrict to known origins in production, allow all in development.
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3001", "http://localhost:3002"];

app.use(
  "*",
  cors({
    origin: (origin) => {
      // Allow requests with no origin (server-to-server, curl, health checks).
      if (!origin) return null;
      if (allowedOrigins.includes(origin)) return origin;
      return null;
    },
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Tenant-Id"],
    maxAge: 86400,
  }),
);

app.onError(errorHandler);

// --- Routes ---
app.route("/", healthRoutes);
app.route("/tenants", tenantRoutes);
app.route("/products", productRoutes);
app.route("/categories", categoryRoutes);
app.route("/uploads", uploadRoutes);
app.route("/orders", orderRoutes);
app.route("/inventory", inventoryRoutes);
app.route("/payments", paymentRoutes);
app.route("/checkout", publicOrderRoutes);
app.route("/exchange-rates", exchangeRateRoutes);
app.route("/catalog", catalogRoutes);

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

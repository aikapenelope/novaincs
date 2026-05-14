import { Hono } from "hono";

export const healthRoutes = new Hono();

/** Basic health check. Extend later to verify DB and Redis connectivity. */
healthRoutes.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "qyne-api",
    timestamp: new Date().toISOString(),
  });
});

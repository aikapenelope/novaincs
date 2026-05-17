import { Hono } from "hono";
import type { AppEnv } from "../app.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";
import { generateBriefing, gatherBriefingData } from "../services/daily-briefing.js";

export const briefingRoutes = new Hono<AppEnv>();

briefingRoutes.use("*", authMiddleware, tenantMiddleware);

/**
 * GET /briefing — Get today's daily briefing for the current tenant.
 *
 * Generates the briefing on-demand using the Finance Agent.
 * The cron job runs at 8 AM UTC, but merchants can also request
 * a fresh briefing anytime from the dashboard.
 */
briefingRoutes.get("/", async (c) => {
  const tenantId = c.get("tenantId")!;
  const briefing = await generateBriefing(tenantId);
  return c.json({ data: briefing });
});

/**
 * GET /briefing/data — Get raw briefing data without AI summary.
 *
 * Useful for the dashboard to render its own UI with the numbers,
 * without waiting for the agent to generate a summary.
 */
briefingRoutes.get("/data", async (c) => {
  const tenantId = c.get("tenantId")!;
  const data = await gatherBriefingData(tenantId);
  return c.json({ data });
});

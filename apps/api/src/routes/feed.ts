import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, count, sql } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { feedItems } from "../db/schema/notifications.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";

export const feedRoutes = new Hono<AppEnv>();

// All feed routes require auth + tenant context.
feedRoutes.use("*", authMiddleware, tenantMiddleware);

// --- Schemas ---

const listFeedSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  unreadOnly: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

// --- Routes ---

/**
 * GET /feed — List feed items for the current tenant.
 * Returns non-dismissed items sorted by priority then recency.
 * Supports pagination and optional unread-only filter.
 */
feedRoutes.get("/", zValidator("query", listFeedSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { limit, offset, unreadOnly } = c.req.valid("query");
  const db = getDb();

  const conditions = [eq(feedItems.tenantId, tenantId), eq(feedItems.isDismissed, false)];

  if (unreadOnly) {
    conditions.push(eq(feedItems.isRead, false));
  }

  // Priority ordering: critical > high > medium > low.
  const priorityOrder = sql`CASE ${feedItems.priority}
    WHEN 'critical' THEN 0
    WHEN 'high' THEN 1
    WHEN 'medium' THEN 2
    WHEN 'low' THEN 3
    ELSE 4
  END`;

  const [items, [totalResult]] = await Promise.all([
    db
      .select()
      .from(feedItems)
      .where(and(...conditions))
      .orderBy(priorityOrder, desc(feedItems.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(feedItems)
      .where(and(...conditions)),
  ]);

  // Also get unread count for badge display.
  const [unreadResult] = await db
    .select({ unread: count() })
    .from(feedItems)
    .where(
      and(
        eq(feedItems.tenantId, tenantId),
        eq(feedItems.isDismissed, false),
        eq(feedItems.isRead, false),
      ),
    );

  return c.json({
    data: items,
    total: totalResult?.total ?? 0,
    unread: unreadResult?.unread ?? 0,
  });
});

/**
 * PATCH /feed/:id/read — Mark a feed item as read.
 */
feedRoutes.patch("/:id/read", async (c) => {
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");
  const db = getDb();

  const [updated] = await db
    .update(feedItems)
    .set({ isRead: true })
    .where(and(eq(feedItems.id, id), eq(feedItems.tenantId, tenantId)))
    .returning({ id: feedItems.id });

  if (!updated) {
    return c.json({ error: "Feed item not found" }, 404);
  }

  return c.json({ ok: true });
});

/**
 * PATCH /feed/:id/dismiss — Dismiss a feed item (hide from feed).
 */
feedRoutes.patch("/:id/dismiss", async (c) => {
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");
  const db = getDb();

  const [updated] = await db
    .update(feedItems)
    .set({ isDismissed: true, isRead: true })
    .where(and(eq(feedItems.id, id), eq(feedItems.tenantId, tenantId)))
    .returning({ id: feedItems.id });

  if (!updated) {
    return c.json({ error: "Feed item not found" }, 404);
  }

  return c.json({ ok: true });
});

/**
 * POST /feed/read-all — Mark all feed items as read for the current tenant.
 */
feedRoutes.post("/read-all", async (c) => {
  const tenantId = c.get("tenantId")!;
  const db = getDb();

  const result = await db
    .update(feedItems)
    .set({ isRead: true })
    .where(and(eq(feedItems.tenantId, tenantId), eq(feedItems.isRead, false)))
    .returning({ id: feedItems.id });

  return c.json({ ok: true, updated: result.length });
});

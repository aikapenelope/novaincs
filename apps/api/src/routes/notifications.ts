import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, desc, count } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { notifications } from "../db/schema/notifications.js";
import { authMiddleware, tenantMiddleware } from "../middleware/auth.js";

export const notificationRoutes = new Hono<AppEnv>();

// All notification routes require auth + tenant context.
notificationRoutes.use("*", authMiddleware, tenantMiddleware);

// --- Schemas ---

const listNotificationsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).default(0),
});

// --- Routes ---

/**
 * GET /notifications — List notifications for the current tenant.
 * Returns most recent first. Includes unread count for badge display.
 * Polled by the dashboard every 30 seconds.
 */
notificationRoutes.get("/", zValidator("query", listNotificationsSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const { limit, offset } = c.req.valid("query");
  const db = getDb();

  const [items, [totalResult], [unreadResult]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(eq(notifications.tenantId, tenantId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(notifications).where(eq(notifications.tenantId, tenantId)),
    db
      .select({ unread: count() })
      .from(notifications)
      .where(and(eq(notifications.tenantId, tenantId), eq(notifications.isRead, false))),
  ]);

  return c.json({
    data: items,
    total: totalResult?.total ?? 0,
    unread: unreadResult?.unread ?? 0,
  });
});

/**
 * GET /notifications/unread-count — Lightweight endpoint for badge polling.
 * Returns only the unread count (no notification data).
 */
notificationRoutes.get("/unread-count", async (c) => {
  const tenantId = c.get("tenantId")!;
  const db = getDb();

  const [result] = await db
    .select({ unread: count() })
    .from(notifications)
    .where(and(eq(notifications.tenantId, tenantId), eq(notifications.isRead, false)));

  return c.json({ unread: result?.unread ?? 0 });
});

/**
 * PATCH /notifications/:id/read — Mark a single notification as read.
 */
notificationRoutes.patch("/:id/read", async (c) => {
  const tenantId = c.get("tenantId")!;
  const id = c.req.param("id");
  const db = getDb();

  const [updated] = await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, id), eq(notifications.tenantId, tenantId)))
    .returning({ id: notifications.id });

  if (!updated) {
    return c.json({ error: "Notification not found" }, 404);
  }

  return c.json({ ok: true });
});

/**
 * POST /notifications/read-all — Mark all notifications as read.
 */
notificationRoutes.post("/read-all", async (c) => {
  const tenantId = c.get("tenantId")!;
  const db = getDb();

  const result = await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.tenantId, tenantId), eq(notifications.isRead, false)))
    .returning({ id: notifications.id });

  return c.json({ ok: true, updated: result.length });
});

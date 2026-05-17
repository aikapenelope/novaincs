import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppEnv } from "../app.js";
import { enqueueEvent } from "../services/event-worker.js";

/**
 * Beacon API — public endpoint for behavioral event tracking.
 *
 * The catalog PWA sends events here (page views, product views, add-to-cart,
 * checkout starts, etc.) without requiring authentication.
 *
 * Events are queued in Redis via BullMQ and batch-inserted into PostgreSQL
 * by the event worker. This keeps the beacon response fast (<10ms) and
 * prevents high-volume tracking from impacting API latency.
 *
 * Event types:
 *   - page_view: visitor viewed a page
 *   - product_view: visitor viewed a product detail page
 *   - add_to_cart: visitor added a product to cart
 *   - remove_from_cart: visitor removed a product from cart
 *   - checkout_start: visitor started checkout flow
 *   - checkout_complete: visitor completed checkout
 *   - search: visitor searched for products
 */

const beaconRoutes = new Hono<AppEnv>();

const eventSchema = z.object({
  tenantId: z.string().uuid(),
  eventType: z.string().min(1).max(100),
  entityType: z.string().max(50).nullish(),
  entityId: z.string().uuid().nullish(),
  visitorId: z.string().max(255).nullish(),
  customerId: z.string().uuid().nullish(),
  data: z.record(z.unknown()).default({}),
});

const batchEventSchema = z.object({
  events: z.array(eventSchema).min(1).max(50),
});

/**
 * POST /beacon — Track a single behavioral event.
 *
 * No auth required. The catalog PWA calls this on every page view,
 * product view, add-to-cart, etc.
 */
beaconRoutes.post("/", zValidator("json", eventSchema), async (c) => {
  const event = c.req.valid("json");

  const queued = enqueueEvent({
    tenantId: event.tenantId,
    eventType: event.eventType,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    actorType: "visitor",
    actorId: event.visitorId ?? null,
    customerId: event.customerId ?? null,
    data: event.data,
    metadata: {
      ip: c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown",
      userAgent: c.req.header("User-Agent") ?? "",
    },
  });

  if (!queued) {
    // Redis unavailable — silently drop the event.
    // Tracking is best-effort; we never block the user experience.
    return c.json({ status: "dropped" }, 202);
  }

  return c.json({ status: "queued" }, 202);
});

/**
 * POST /beacon/batch — Track multiple events at once.
 *
 * Used by the catalog PWA to batch events before sending (e.g., on
 * page unload via navigator.sendBeacon).
 */
beaconRoutes.post("/batch", zValidator("json", batchEventSchema), async (c) => {
  const { events } = c.req.valid("json");
  let queued = 0;

  for (const event of events) {
    const ok = enqueueEvent({
      tenantId: event.tenantId,
      eventType: event.eventType,
      entityType: event.entityType ?? null,
      entityId: event.entityId ?? null,
      actorType: "visitor",
      actorId: event.visitorId ?? null,
      customerId: event.customerId ?? null,
      data: event.data,
      metadata: {
        ip: c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown",
        userAgent: c.req.header("User-Agent") ?? "",
      },
    });
    if (ok) queued++;
  }

  return c.json({ status: "queued", queued, total: events.length }, 202);
});

export { beaconRoutes };

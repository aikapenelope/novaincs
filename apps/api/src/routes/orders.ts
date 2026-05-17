import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq, and, sql, gt } from "drizzle-orm";
import type { AppEnv } from "../app.js";
import { getDb } from "../db/index.js";
import { orders, orderItems, payments } from "../db/schema/orders.js";
import { products, productVariants } from "../db/schema/products.js";
import { inventoryMovements } from "../db/schema/inventory.js";
import { tenantMiddleware, authMiddleware } from "../middleware/auth.js";

// --- Schemas ---

const cartItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullish(),
  quantity: z.number().int().min(1),
});

const createOrderSchema = z.object({
  buyerName: z.string().min(1).max(255),
  buyerPhone: z.string().min(5).max(50).nullish(),
  deliveryMethod: z.enum(["pickup", "delivery"]).default("pickup"),
  deliveryAddress: z.string().max(500).nullish(),
  paymentMethod: z.enum(["pago_movil", "zelle", "cash_on_delivery"]),
  items: z.array(cartItemSchema).min(1).max(50),
  notes: z.string().max(1000).nullish(),
});

const updateOrderStatusSchema = z.object({
  status: z.enum([
    "payment_pending",
    "screenshot_uploaded",
    "verifying",
    "verified",
    "rejected",
    "preparing",
    "shipped",
    "delivered",
    "cancelled",
  ]),
});

const listOrdersSchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// --- Public checkout route (no auth required) ---

const publicOrderRoutes = new Hono<AppEnv>();

/**
 * POST /checkout/:tenantSlug — Create an order from the public catalog.
 *
 * This is the buyer-facing endpoint. No auth required.
 * The tenant is resolved from the URL slug (not from a header).
 *
 * Flow:
 * 1. Resolve tenant from slug
 * 2. Validate all items exist and have sufficient stock
 * 3. Calculate totals from current prices
 * 4. Create order + order items in a transaction
 * 5. Reserve stock (decrement product/variant stock)
 * 6. Set expiration for stock reservation (24h)
 * 7. Find or create customer by phone
 * 8. Return order with payment instructions
 */
publicOrderRoutes.post("/:tenantSlug", zValidator("json", createOrderSchema), async (c) => {
  const tenantSlug = c.req.param("tenantSlug");
  const body = c.req.valid("json");
  const db = getDb();

  // Resolve tenant from slug (no RLS context needed for this lookup).
  const { tenants } = await import("../db/schema/tenants.js");
  const [tenant] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, tenantSlug))
    .limit(1);

  if (!tenant) {
    return c.json({ error: { message: "Store not found", status: 404 } }, 404);
  }

  const tenantId = tenant.id;

  // Set RLS context for all subsequent queries.
  // Uses session-level setting; cleared after the request completes.
  const { setTenantContext, clearTenantContext } = await import("../db/tenant-context.js");
  await setTenantContext(db, tenantId);

  try {
    // Validate items and calculate totals.
    const resolvedItems: {
      productId: string;
      variantId: string | null;
      productName: string;
      variantName: string | null;
      quantity: number;
      unitPriceUsd: string;
      unitPriceBs: string | null;
      currentStock: number;
      isVariant: boolean;
    }[] = [];

    for (const item of body.items) {
      const [product] = await db
        .select()
        .from(products)
        .where(and(eq(products.id, item.productId), eq(products.tenantId, tenantId)))
        .limit(1);

      if (!product) {
        return c.json(
          { error: { message: `Product not found: ${item.productId}`, status: 400 } },
          400,
        );
      }

      if (item.variantId) {
        const [variant] = await db
          .select()
          .from(productVariants)
          .where(
            and(
              eq(productVariants.id, item.variantId),
              eq(productVariants.productId, item.productId),
            ),
          )
          .limit(1);

        if (!variant) {
          return c.json(
            { error: { message: `Variant not found: ${item.variantId}`, status: 400 } },
            400,
          );
        }

        if (variant.stock < item.quantity) {
          return c.json(
            {
              error: {
                message: `Insufficient stock for ${product.name} - ${variant.name}: ${variant.stock} available, ${item.quantity} requested`,
                status: 400,
              },
            },
            400,
          );
        }

        resolvedItems.push({
          productId: product.id,
          variantId: variant.id,
          productName: product.name,
          variantName: variant.name,
          quantity: item.quantity,
          unitPriceUsd: variant.priceUsd ?? product.priceUsd ?? "0",
          unitPriceBs: variant.priceBs ?? product.priceBs,
          currentStock: variant.stock,
          isVariant: true,
        });
      } else {
        if (product.stock < item.quantity) {
          return c.json(
            {
              error: {
                message: `Insufficient stock for ${product.name}: ${product.stock} available, ${item.quantity} requested`,
                status: 400,
              },
            },
            400,
          );
        }

        resolvedItems.push({
          productId: product.id,
          variantId: null,
          productName: product.name,
          variantName: null,
          quantity: item.quantity,
          unitPriceUsd: product.priceUsd ?? "0",
          unitPriceBs: product.priceBs,
          currentStock: product.stock,
          isVariant: false,
        });
      }
    }

    // Calculate totals.
    const totalUsd = resolvedItems
      .reduce((sum, item) => sum + Number(item.unitPriceUsd) * item.quantity, 0)
      .toFixed(2);

    const hasBsPrice = resolvedItems.every((item) => item.unitPriceBs !== null);
    const totalBs = hasBsPrice
      ? resolvedItems
          .reduce((sum, item) => sum + Number(item.unitPriceBs) * item.quantity, 0)
          .toFixed(2)
      : null;

    // Generate order number: QYNE-{timestamp}-{random}
    const orderNumber = `Q-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Stock reservation expires in 24 hours.
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create order in a transaction.
    const result = await db.transaction(async (tx) => {
      // 1. Create the order.
      const [order] = await tx
        .insert(orders)
        .values({
          tenantId,
          orderNumber,
          buyerName: body.buyerName,
          buyerPhone: body.buyerPhone ?? null,
          totalUsd,
          totalBs,
          status: "payment_pending",
          paymentMethod: body.paymentMethod,
          paymentStatus: "pending",
          deliveryMethod: body.deliveryMethod,
          deliveryAddress: body.deliveryAddress ?? null,
          expiresAt,
          notes: body.notes ?? null,
        })
        .returning();

      // 2. Create order items.
      await tx.insert(orderItems).values(
        resolvedItems.map((item) => ({
          tenantId,
          orderId: order.id,
          productId: item.productId,
          variantId: item.variantId,
          productName: item.productName,
          variantName: item.variantName,
          quantity: item.quantity,
          unitPriceUsd: item.unitPriceUsd,
          unitPriceBs: item.unitPriceBs,
        })),
      );

      // 3. Reserve stock (decrement).
      for (const item of resolvedItems) {
        if (item.isVariant && item.variantId) {
          await tx
            .update(productVariants)
            .set({ stock: sql`${productVariants.stock} - ${item.quantity}` })
            .where(eq(productVariants.id, item.variantId));
        } else {
          await tx
            .update(products)
            .set({ stock: sql`${products.stock} - ${item.quantity}` })
            .where(eq(products.id, item.productId));
        }

        // Record inventory movement.
        await tx.insert(inventoryMovements).values({
          tenantId,
          productId: item.productId,
          quantity: -item.quantity,
          reason: "sale_reserved",
          referenceId: order.id,
        });
      }

      // 4. Find or create customer and update their CRM stats.
      const { syncCustomerFromOrder } = await import("../services/customer-sync.js");
      await syncCustomerFromOrder(tx, {
        tenantId,
        buyerName: body.buyerName,
        buyerPhone: body.buyerPhone ?? null,
        orderId: order.id,
        totalUsd,
      });

      return order;
    });

    return c.json(
      {
        data: {
          id: result.id,
          orderNumber: result.orderNumber,
          totalUsd,
          totalBs,
          status: result.status,
          paymentMethod: result.paymentMethod,
          expiresAt: result.expiresAt,
        },
      },
      201,
    );
  } finally {
    await clearTenantContext(db).catch(() => {});
  }
});

// --- Merchant order management routes (auth required) ---

const merchantOrderRoutes = new Hono<AppEnv>();
merchantOrderRoutes.use("*", authMiddleware, tenantMiddleware);

/**
 * GET /orders — List orders for the current tenant.
 */
merchantOrderRoutes.get("/", zValidator("query", listOrdersSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const query = c.req.valid("query");
  const db = getDb();

  const conditions = [eq(orders.tenantId, tenantId)];
  if (query.status) conditions.push(eq(orders.status, query.status));

  const { count } = await import("drizzle-orm");

  const [rows, [countResult]] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(sql`${orders.createdAt} DESC`)
      .limit(query.limit)
      .offset(query.offset),
    db
      .select({ total: count() })
      .from(orders)
      .where(and(...conditions)),
  ]);

  return c.json({
    data: rows,
    total: countResult?.total ?? 0,
    limit: query.limit,
    offset: query.offset,
  });
});

/**
 * GET /orders/:id — Get a single order with its items.
 */
merchantOrderRoutes.get("/:id", async (c) => {
  const tenantId = c.get("tenantId")!;
  const orderId = c.req.param("id");
  const db = getDb();

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
    .limit(1);

  if (!order) {
    return c.json({ error: { message: "Order not found", status: 404 } }, 404);
  }

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  const orderPayments = await db.select().from(payments).where(eq(payments.orderId, orderId));

  return c.json({ data: { ...order, items, payments: orderPayments } });
});

/**
 * PATCH /orders/:id/status — Update order status.
 * Handles inventory adjustments on cancellation (release reserved stock).
 */
merchantOrderRoutes.patch("/:id/status", zValidator("json", updateOrderStatusSchema), async (c) => {
  const tenantId = c.get("tenantId")!;
  const orderId = c.req.param("id");
  const body = c.req.valid("json");
  const db = getDb();

  const [order] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.tenantId, tenantId)))
    .limit(1);

  if (!order) {
    return c.json({ error: { message: "Order not found", status: 404 } }, 404);
  }

  const result = await db.transaction(async (tx) => {
    // If cancelling, release reserved stock.
    if (body.status === "cancelled" && order.status !== "cancelled") {
      const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));

      for (const item of items) {
        if (item.variantId) {
          await tx
            .update(productVariants)
            .set({ stock: sql`${productVariants.stock} + ${item.quantity}` })
            .where(eq(productVariants.id, item.variantId));
        } else if (item.productId) {
          await tx
            .update(products)
            .set({ stock: sql`${products.stock} + ${item.quantity}` })
            .where(eq(products.id, item.productId));
        }

        await tx.insert(inventoryMovements).values({
          tenantId,
          productId: item.productId!,
          quantity: item.quantity,
          reason: "sale_cancelled",
          referenceId: orderId,
        });
      }
    }

    // If marking as verified, update payment status too.
    const updates: Record<string, unknown> = { status: body.status };
    if (body.status === "verified") {
      updates.paymentStatus = "verified";
      updates.expiresAt = null; // Clear reservation expiry.
    }

    const [updated] = await tx
      .update(orders)
      .set(updates)
      .where(eq(orders.id, orderId))
      .returning();

    return updated;
  });

  return c.json({ data: result });
});

export { publicOrderRoutes, merchantOrderRoutes as orderRoutes };

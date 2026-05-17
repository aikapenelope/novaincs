/**
 * Notification service — creates in-app notifications for merchants.
 *
 * Called by order routes, payment routes, and workers when events occur
 * that the merchant should know about immediately. The dashboard polls
 * GET /notifications/unread-count every 30 seconds to show the badge.
 *
 * This is a simple insert-based service. No queues, no WebSocket —
 * just write to the notifications table and let polling pick it up.
 */

import { getDb } from "../db/index.js";
import { notifications } from "../db/schema/notifications.js";

interface CreateNotificationParams {
  tenantId: string;
  type: string;
  title: string;
  body?: string;
  actionUrl?: string;
  entityType?: string;
  entityId?: string;
  data?: Record<string, unknown>;
}

/**
 * Create a notification for a tenant.
 * Safe to call from any context (route handler, worker, etc.).
 */
export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const db = getDb();
    await db.insert(notifications).values({
      tenantId: params.tenantId,
      type: params.type,
      title: params.title,
      body: params.body,
      actionUrl: params.actionUrl,
      entityType: params.entityType,
      entityId: params.entityId,
      data: params.data ?? {},
    });
  } catch (err) {
    // Notifications are non-critical — log and continue.
    console.error("[notification-service] Failed to create notification:", err);
  }
}

// --- Convenience functions for common notification types ---

export function notifyNewOrder(
  tenantId: string,
  orderNumber: string,
  buyerName: string,
  totalUsd: string,
  orderId: string,
): Promise<void> {
  return createNotification({
    tenantId,
    type: "new_order",
    title: `Nuevo pedido #${orderNumber} de ${buyerName} ($${totalUsd})`,
    body: "Revisa el pedido y espera el pago.",
    actionUrl: `/orders/${orderId}`,
    entityType: "order",
    entityId: orderId,
    data: { orderNumber, buyerName, totalUsd },
  });
}

export function notifyPaymentUploaded(
  tenantId: string,
  orderNumber: string,
  orderId: string,
): Promise<void> {
  return createNotification({
    tenantId,
    type: "payment_uploaded",
    title: `Capture de pago recibido para pedido #${orderNumber}`,
    body: "Verifica el pago para confirmar la venta.",
    actionUrl: `/orders/${orderId}`,
    entityType: "order",
    entityId: orderId,
    data: { orderNumber },
  });
}

export function notifyPaymentVerified(
  tenantId: string,
  orderNumber: string,
  orderId: string,
  totalUsd: string,
): Promise<void> {
  return createNotification({
    tenantId,
    type: "payment_verified",
    title: `Pago verificado para pedido #${orderNumber} ($${totalUsd})`,
    body: "El pedido esta listo para preparar.",
    actionUrl: `/orders/${orderId}`,
    entityType: "order",
    entityId: orderId,
    data: { orderNumber, totalUsd },
  });
}

export function notifyLowStock(
  tenantId: string,
  productName: string,
  stock: number,
  productId: string,
): Promise<void> {
  const stockText = stock === 0 ? "agotado" : `solo ${stock} unidades`;
  return createNotification({
    tenantId,
    type: "low_stock",
    title: `${productName}: ${stockText}`,
    body: stock === 0 ? "Los clientes no pueden comprar este producto." : "Considera reabastecer.",
    actionUrl: `/products/${productId}`,
    entityType: "product",
    entityId: productId,
    data: { productName, stock },
  });
}

export function notifyNewCustomer(
  tenantId: string,
  customerName: string,
  customerId: string,
): Promise<void> {
  return createNotification({
    tenantId,
    type: "new_customer",
    title: `Nuevo cliente: ${customerName}`,
    actionUrl: `/customers/${customerId}`,
    entityType: "customer",
    entityId: customerId,
    data: { customerName },
  });
}

export function notifyOrderExpired(
  tenantId: string,
  orderNumber: string,
  orderId: string,
): Promise<void> {
  return createNotification({
    tenantId,
    type: "order_expired",
    title: `Pedido #${orderNumber} expirado — stock liberado`,
    body: "El comprador no completo el pago a tiempo.",
    actionUrl: `/orders/${orderId}`,
    entityType: "order",
    entityId: orderId,
    data: { orderNumber },
  });
}

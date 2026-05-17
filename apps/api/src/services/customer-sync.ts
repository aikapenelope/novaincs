/**
 * Customer sync service.
 *
 * Automatically creates or updates customer profiles when orders are placed.
 * Recalculates lifetime value, total orders, and average order value.
 *
 * This is the core of the "auto-profile" CRM: merchants never fill out
 * a customer form — profiles build from observed purchase behavior.
 */

import { eq, and, sql } from "drizzle-orm";
import { customers } from "../db/schema/customers.js";
import { orders } from "../db/schema/orders.js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

type Tx = Parameters<Parameters<PostgresJsDatabase<Record<string, unknown>>["transaction"]>[0]>[0];

interface OrderCustomerInfo {
  tenantId: string;
  buyerName: string;
  buyerPhone: string | null;
  orderId: string;
  totalUsd: string;
}

/**
 * Find or create a customer from order data, then update their stats.
 *
 * Called inside the order creation transaction so the customer link
 * and stats update are atomic with the order itself.
 *
 * Returns the customer ID (existing or newly created).
 */
export async function syncCustomerFromOrder(tx: Tx, info: OrderCustomerInfo): Promise<string> {
  const { tenantId, buyerName, buyerPhone, orderId, totalUsd } = info;

  // Without a phone number, we can't reliably match customers.
  // Create an anonymous customer linked only to this order.
  if (!buyerPhone) {
    const [newCustomer] = await tx
      .insert(customers)
      .values({
        tenantId,
        name: buyerName,
        totalOrders: 1,
        lifetimeValue: totalUsd,
        averageOrderValue: totalUsd,
        lastPurchaseAt: new Date(),
      })
      .returning({ id: customers.id });

    await tx.update(orders).set({ customerId: newCustomer.id }).where(eq(orders.id, orderId));

    return newCustomer.id;
  }

  // Look up existing customer by phone within this tenant.
  const [existing] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.phone, buyerPhone)))
    .limit(1);

  if (existing) {
    // Update existing customer: increment orders, recalculate lifetime value and average.
    await tx
      .update(customers)
      .set({
        name: buyerName, // Update name to latest (buyer may correct spelling)
        totalOrders: sql`${customers.totalOrders} + 1`,
        lifetimeValue: sql`(${customers.lifetimeValue}::numeric + ${Number(totalUsd)})::text`,
        averageOrderValue: sql`((${customers.lifetimeValue}::numeric + ${Number(totalUsd)}) / (${customers.totalOrders} + 1))::text`,
        lastPurchaseAt: new Date(),
      })
      .where(eq(customers.id, existing.id));

    await tx.update(orders).set({ customerId: existing.id }).where(eq(orders.id, orderId));

    return existing.id;
  }

  // Create new customer.
  const [newCustomer] = await tx
    .insert(customers)
    .values({
      tenantId,
      name: buyerName,
      phone: buyerPhone,
      totalOrders: 1,
      lifetimeValue: totalUsd,
      averageOrderValue: totalUsd,
      lastPurchaseAt: new Date(),
    })
    .returning({ id: customers.id });

  await tx.update(orders).set({ customerId: newCustomer.id }).where(eq(orders.id, orderId));

  return newCustomer.id;
}

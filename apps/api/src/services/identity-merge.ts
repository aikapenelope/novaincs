/**
 * Identity merge service.
 *
 * Links anonymous visitor browsing sessions to identified customers.
 *
 * Flow:
 *   1. Visitor browses catalog → beacon events recorded with visitorId (anonymous)
 *   2. Visitor checks out → provides phone number → customer created/matched
 *   3. This service merges the visitorId into the customer record and
 *      retroactively links all prior anonymous events to the customer.
 *
 * This enables the CRM to show a complete timeline: "Maria browsed 5 products
 * over 3 days before her first purchase" — even though she was anonymous
 * during those visits.
 *
 * Called from the order creation flow (customer-sync) when a visitorId
 * is available in the checkout context.
 */

import { eq, and, sql, isNull } from "drizzle-orm";
import { customers, customerEvents } from "../db/schema/customers.js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

type Db = PostgresJsDatabase<Record<string, unknown>>;

/**
 * Merge an anonymous visitor into an identified customer.
 *
 * 1. Adds the visitorId to the customer's visitor_ids array (if not already present)
 * 2. Links all anonymous events from this visitorId to the customer
 *
 * Safe to call multiple times with the same visitorId — idempotent.
 */
export async function mergeVisitorToCustomer(
  db: Db,
  tenantId: string,
  customerId: string,
  visitorId: string,
): Promise<{ eventsLinked: number }> {
  if (!visitorId || !customerId) return { eventsLinked: 0 };

  // 1. Add visitorId to the customer's visitor_ids array if not already present.
  //    Uses jsonb containment check to avoid duplicates.
  await db.execute(
    sql`UPDATE customers
        SET visitor_ids = CASE
          WHEN visitor_ids @> ${JSON.stringify([visitorId])}::jsonb THEN visitor_ids
          ELSE visitor_ids || ${JSON.stringify([visitorId])}::jsonb
        END
        WHERE id = ${customerId} AND tenant_id = ${tenantId}`,
  );

  // 2. Link all anonymous events from this visitorId to the customer.
  //    Only update events that don't already have a customerId (avoid overwriting
  //    events that were already linked to a different customer).
  const result = await db.execute(
    sql`UPDATE customer_events
        SET customer_id = ${customerId}
        WHERE tenant_id = ${tenantId}
          AND actor_id = ${visitorId}
          AND actor_type = 'visitor'
          AND customer_id IS NULL`,
  );

  // postgres.js returns rowCount on the result.
  const eventsLinked = (result as unknown as { rowCount?: number }).rowCount ?? 0;

  if (eventsLinked > 0) {
    console.log(
      `[identity-merge] Linked ${eventsLinked} anonymous events from visitor ${visitorId.slice(0, 8)}... to customer ${customerId.slice(0, 8)}...`,
    );
  }

  return { eventsLinked };
}

/**
 * Merge multiple visitor IDs into a single customer.
 * Used when a customer has browsed from multiple devices/sessions.
 */
export async function mergeMultipleVisitors(
  db: Db,
  tenantId: string,
  customerId: string,
  visitorIds: string[],
): Promise<{ totalEventsLinked: number }> {
  let totalEventsLinked = 0;

  for (const visitorId of visitorIds) {
    const { eventsLinked } = await mergeVisitorToCustomer(db, tenantId, customerId, visitorId);
    totalEventsLinked += eventsLinked;
  }

  return { totalEventsLinked };
}

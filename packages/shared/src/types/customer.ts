/** Auto-generated customer segment based on RFM analysis. */
export type CustomerSegment =
  | "vip"
  | "loyal"
  | "promising"
  | "at_risk"
  | "hibernating"
  | "window_shopper"
  | "new"
  | "one_timer";

/** RFM score (1-5 per dimension). */
export interface RfmScore {
  recency: number;
  frequency: number;
  monetary: number;
}

/** A customer profile, auto-populated from orders and behavior. */
export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  phone: string | null;
  email: string | null;
  deliveryZone: string | null;
  preferredPaymentMethod: string | null;
  lifetimeValue: number;
  totalOrders: number;
  averageOrderValue: number;
  lastPurchaseAt: string | null;
  rfmScore: RfmScore | null;
  segment: CustomerSegment | null;
  tags: string[];
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

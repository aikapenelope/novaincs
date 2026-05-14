/** Order lifecycle status. */
export type OrderStatus =
  | "created"
  | "payment_pending"
  | "screenshot_uploaded"
  | "verifying"
  | "verified"
  | "rejected"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled";

/** Supported payment methods. */
export type PaymentMethod = "pago_movil" | "zelle" | "cash_on_delivery";

/** Payment verification status. */
export type PaymentStatus =
  | "pending"
  | "screenshot_uploaded"
  | "verifying"
  | "verified"
  | "rejected";

/** A line item in an order. */
export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceUsd: number;
  unitPriceBs: number | null;
}

/** A customer order. */
export interface Order {
  id: string;
  tenantId: string;
  customerId: string;
  orderNumber: string;
  items: OrderItem[];
  totalUsd: number;
  totalBs: number | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  paymentScreenshotUrl: string | null;
  deliveryMethod: "pickup" | "delivery";
  deliveryAddress: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export const ORDER_STATUSES = [
  "pending_payment",
  "placed",
  "packed",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "pending", // online payment not yet confirmed
  "paid", // confirmed by server (signature + gateway check, or webhook)
  "failed",
  "cod_pending", // cash on delivery, not yet collected
  "cod_collected",
  "refund_pending", // money received but order cannot be fulfilled
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["cod", "razorpay", "mock"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  placed: "Order placed",
  packed: "Packed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Payment pending",
  paid: "Paid",
  failed: "Payment failed",
  cod_pending: "Cash on delivery",
  cod_collected: "Cash collected",
  refund_pending: "Refund pending",
  refunded: "Refunded",
};

/**
 * Transitions staff may perform from the admin panel.
 * pending_payment -> placed is NOT here: only a verified payment can do that.
 */
const ADMIN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["cancelled"],
  placed: ["packed", "cancelled"],
  packed: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function allowedAdminTransitions(from: OrderStatus): OrderStatus[] {
  return ADMIN_TRANSITIONS[from];
}

export function canAdminTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ADMIN_TRANSITIONS[from].includes(to);
}

/** Customers may cancel only before the order is packed. */
export function canCustomerCancel(status: OrderStatus): boolean {
  return status === "pending_payment" || status === "placed";
}

/** Steps shown on the tracking timeline (cancelled is shown separately). */
export const TRACKING_STEPS: OrderStatus[] = ["placed", "packed", "out_for_delivery", "delivered"];

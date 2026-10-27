export const ORDER_STATUSES = [
  "pending_payment",
  "pending_confirmation", // WhatsApp cash-on-delivery order: saved, waiting for the store to confirm it
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
  "cod_cancelled", // cash-on-delivery order cancelled — nothing to collect
  "refund_pending", // money received but order cannot be fulfilled
  "refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["cod", "razorpay", "mock", "upi", "razorpay_link"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** How the customer pays. Separate from PAYMENT_STATUS (whether the money has been received). */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cod: "Cash on delivery",
  razorpay: "Online (Razorpay)",
  mock: "Test payment",
  upi: "UPI (QR / UPI ID)",
  razorpay_link: "Razorpay payment link",
};

/**
 * Methods whose money is confirmed by a payment provider or by staff, not on delivery.
 * Orders paid this way wait in "pending_payment" until the payment is verified.
 */
export const PREPAID_METHODS: PaymentMethod[] = ["razorpay", "mock", "upi", "razorpay_link"];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment",
  pending_confirmation: "Pending confirmation",
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
  cod_cancelled: "Not collected — order cancelled",
  refund_pending: "Refund pending",
  refunded: "Refunded",
};

/**
 * Transitions staff may perform from the admin panel.
 * pending_payment -> placed is NOT here: only a verified payment can do that.
 */
const ADMIN_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["cancelled"],
  pending_confirmation: ["placed", "cancelled"], // staff confirm after checking the customer's WhatsApp message
  placed: ["packed", "cancelled"],
  packed: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"], // cancelled: refused / nobody home — the goods come back
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
  return status === "pending_payment" || status === "pending_confirmation" || status === "placed";
}

/** slot_label of WhatsApp orders placed without a delivery slot (time agreed on WhatsApp). */
export const NO_SLOT_LABEL = "Delivery time confirmed on WhatsApp";

/** Steps shown on the tracking timeline (cancelled is shown separately). */
export const TRACKING_STEPS: OrderStatus[] = ["placed", "packed", "out_for_delivery", "delivered"];

/** What to do if an item can't be supplied. No automatic substitution: changes need the customer's OK. */
export const UNAVAILABLE_ITEM_PREFERENCES = ["call", "remove"] as const;
export type UnavailableItemPreference = (typeof UNAVAILABLE_ITEM_PREFERENCES)[number];
export const UNAVAILABLE_ITEM_LABEL: Record<UnavailableItemPreference, { title: string; detail: string; short: string }> = {
  call: {
    title: "Call me about unavailable items",
    detail: "We'll call or WhatsApp you before changing anything. No substitutes or extra charges without your OK.",
    short: "Call customer before any change",
  },
  remove: {
    title: "Remove unavailable items and refund",
    detail: "We'll leave them out and you pay only for what's delivered (refunded if you paid online).",
    short: "Remove item, refund — no substitute",
  },
};

import type { Paise } from "./money";

/** UPI virtual payment address, e.g. ramavatar.store@okaxis (same rule as the database check). */
export const UPI_ID_REGEX = /^[A-Za-z0-9._-]{2,200}@[A-Za-z][A-Za-z0-9.-]{1,63}$/;

export function isValidUpiId(s: string | null | undefined): s is string {
  return typeof s === "string" && UPI_ID_REGEX.test(s.trim());
}

/**
 * Standard UPI deep link / QR payload (NPCI "upi://pay"): opens the customer's UPI app with the
 * store's UPI ID, the exact amount and the order number filled in. Nothing is verified by this —
 * staff still confirm the money arrived before the order is marked paid.
 */
export function buildUpiUri(args: { upiId: string; payeeName?: string | null; amount: Paise; orderNumber: string }): string {
  if (!isValidUpiId(args.upiId)) throw new Error("Invalid UPI ID");
  if (!Number.isInteger(args.amount) || args.amount <= 0) throw new Error("Invalid amount");
  const params = new URLSearchParams({
    pa: args.upiId.trim(),
    pn: (args.payeeName ?? "").replace(/[^\p{L}\p{N} .&'-]/gu, "").trim().slice(0, 50) || "Store",
    am: (args.amount / 100).toFixed(2),
    cu: "INR",
    tn: `Order ${args.orderNumber}`.slice(0, 50),
    tr: args.orderNumber.slice(0, 35),
  });
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

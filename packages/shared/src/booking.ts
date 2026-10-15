import { z } from "zod";
import { formatINR, type Paise } from "./money";
import { buildWhatsAppUrl, cleanText, whatsappCustomerSchema } from "./whatsapp";

/**
 * WhatsApp booking: the order is saved on the server first (server-side prices, server-made
 * booking number, status "pending_confirmation"), then WhatsApp opens with a pre-filled message.
 * Opening WhatsApp — or the customer pressing Send — never confirms the booking: the shop does
 * that in Admin → WhatsApp bookings.
 */

export const BOOKING_STATUSES = ["pending_confirmation", "confirmed", "preparing", "out_for_delivery", "delivered", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_PAYMENT_METHODS = ["upi_qr", "razorpay_link", "cod"] as const;
export type BookingPaymentMethod = (typeof BOOKING_PAYMENT_METHODS)[number];

export const BOOKING_PAYMENT_STATUSES = ["unpaid", "paid", "refunded"] as const;
export type BookingPaymentStatus = (typeof BOOKING_PAYMENT_STATUSES)[number];

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  pending_confirmation: "Pending Confirmation",
  confirmed: "Confirmed",
  preparing: "Preparing",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const BOOKING_PAYMENT_LABEL: Record<BookingPaymentMethod, string> = {
  upi_qr: "UPI QR Code",
  razorpay_link: "Razorpay Payment Link",
  cod: "Cash on Delivery",
};

/** Allowed status changes. A delivered or cancelled booking is final. */
const NEXT: Record<BookingStatus, BookingStatus[]> = {
  pending_confirmation: ["confirmed", "cancelled"],
  confirmed: ["preparing", "out_for_delivery", "cancelled"],
  preparing: ["out_for_delivery", "cancelled"],
  out_for_delivery: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function nextBookingStatuses(s: BookingStatus): BookingStatus[] {
  return NEXT[s];
}

export function canMoveBooking(from: BookingStatus, to: BookingStatus): boolean {
  return NEXT[from].includes(to);
}

/** What the browser sends. Prices/totals are NOT accepted from the client. */
export const createBookingSchema = z.object({
  customer: whatsappCustomerSchema,
  items: z
    .array(z.object({ variantId: z.uuid("Invalid item"), quantity: z.number().int().min(1).max(99) }))
    .min(1, "Your basket is empty.")
    .max(50, "Too many different items in one booking."),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a delivery date"),
  slotId: z.uuid("Choose a delivery slot"),
  paymentMethod: z.enum(BOOKING_PAYMENT_METHODS, { message: "Choose a payment method" }),
  idempotencyKey: z.string().min(8).max(80),
  /** Honeypot field: real customers never fill it (it is hidden). */
  website: z.string().max(200).optional().default(""),
});
export type CreateBookingInput = z.input<typeof createBookingSchema>;

export const adminBookingUpdateSchema = z.union([
  z.object({ status: z.enum(BOOKING_STATUSES), note: z.string().trim().max(200).optional() }),
  z.object({
    payment: z.literal("mark_paid"),
    /** UPI transaction ID (UTR) or "cash" receipt note — required so a payment is never marked paid blindly. */
    reference: z.string().trim().min(4, "Enter the UPI transaction ID (UTR) or a cash receipt note").max(60),
  }),
  z.object({ payment: z.literal("create_link") }),
]);

export interface BookingLine {
  productName: string;
  variantLabel: string;
  quantity: number;
  unitPrice: Paise;
  lineTotal: Paise;
}

export interface BookingMessageData {
  storeName: string;
  bookingNumber: string;
  customerName: string;
  customerPhone: string;
  address: string;
  area: string | null;
  city: string;
  pincode: string;
  notes: string | null;
  deliveryDateLabel: string;
  slotLabel: string;
  lines: BookingLine[];
  subtotal: Paise;
  discount: Paise;
  deliveryFee: Paise;
  total: Paise;
  paymentMethod: BookingPaymentMethod;
  paymentLinkUrl?: string | null;
  upiId?: string | null;
}

/** "Fri, 17 Oct 2026" for an IST calendar date. */
export function formatBookingDate(date: string): string {
  return new Date(`${date}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  });
}

/** Plain-text WhatsApp message (WhatsApp formatting: *bold*). Built from server-verified values. */
export function buildBookingMessage(b: BookingMessageData): string {
  const sum = b.lines.reduce((s, l) => s + l.lineTotal, 0);
  if (b.lines.length === 0) throw new Error("Booking has no items.");
  if (sum !== b.subtotal || b.subtotal - b.discount + b.deliveryFee !== b.total) throw new Error("Booking totals do not add up.");
  const out: string[] = [];
  out.push(`Namaste ${cleanText(b.storeName, 60)}! Mujhe apna order book karna hai.`);
  out.push("");
  out.push(`*Booking ID: ${b.bookingNumber}*`);
  out.push(`Name: ${cleanText(b.customerName, 80)}`);
  out.push(`Mobile: +91 ${b.customerPhone}`);
  const addr = [cleanText(b.address, 200), b.area ? cleanText(b.area, 80) : null, `${cleanText(b.city, 60)} - ${b.pincode}`].filter(Boolean).join(", ");
  out.push(`Delivery Address: ${addr}`);
  out.push(`Delivery: ${b.deliveryDateLabel}, ${cleanText(b.slotLabel, 60)}`);
  if (b.notes) out.push(`Instructions: ${cleanText(b.notes, 200, true)}`);
  out.push("");
  out.push(`*Items (${b.lines.length})*`);
  b.lines.forEach((l, i) => {
    const label = l.variantLabel ? ` (${cleanText(l.variantLabel, 30)})` : "";
    out.push(`${i + 1}. ${cleanText(l.productName, 60)}${label} × ${l.quantity} = ${formatINR(l.lineTotal)}`);
  });
  out.push("");
  out.push(`Subtotal: ${formatINR(b.subtotal)}`);
  if (b.discount > 0) out.push(`Discount: −${formatINR(b.discount)}`);
  out.push(`Delivery Charges: ${b.deliveryFee === 0 ? "Free" : formatINR(b.deliveryFee)}`);
  out.push(`*Total Amount: ${formatINR(b.total)}*`);
  out.push(`Payment Method: ${BOOKING_PAYMENT_LABEL[b.paymentMethod]}`);
  if (b.paymentMethod === "razorpay_link" && b.paymentLinkUrl) out.push(`Payment link: ${b.paymentLinkUrl}`);
  if (b.paymentMethod === "upi_qr" && b.upiId) out.push(`UPI ID: ${cleanText(b.upiId, 60)}`);
  out.push("");
  out.push("Kripya booking confirm karein. Dhanyavaad!");
  return out.join("\n");
}

export function buildBookingWhatsAppUrl(number: string, b: BookingMessageData): string {
  const url = buildWhatsAppUrl(number, buildBookingMessage(b));
  if (url.length > 7000) throw new Error("This booking is too long for one WhatsApp message. Please remove a few items or shorten the instructions.");
  return url;
}

/** UPI IDs look like name@bank. */
export const UPI_ID_REGEX = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

/** upi:// deep link (and QR content) for paying an exact amount, with the booking ID as the note. */
export function buildUpiLink(args: { upiId: string; payeeName: string; amount: Paise; note: string }): string {
  if (!UPI_ID_REGEX.test(args.upiId)) throw new Error("Invalid UPI ID");
  const p = new URLSearchParams({
    pa: args.upiId,
    pn: cleanText(args.payeeName, 50),
    am: (args.amount / 100).toFixed(2),
    cu: "INR",
    tn: cleanText(args.note, 50),
  });
  return `upi://pay?${p.toString().replace(/\+/g, "%20")}`;
}

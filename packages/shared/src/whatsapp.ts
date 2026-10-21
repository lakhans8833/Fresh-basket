import { z } from "zod";
import { formatINR, type Paise } from "./money";
import { isValidIndianMobile, normalizePhone, PINCODE_REGEX } from "./pincode";

/**
 * WhatsApp "click to chat" ordering.
 *
 * The site never sends anything to WhatsApp by itself: it opens
 * https://wa.me/<number>?text=<message> and the customer must press Send.
 * The message is built on the customer's device, so its totals are a summary
 * the seller should double-check — they are not a secure payment record.
 */

/** International format, digits only, no leading zero: e.g. 919876543210. */
export const WHATSAPP_NUMBER_REGEX = /^[1-9]\d{9,14}$/;

/**
 * Normalise a configured seller number. Accepts "+91 98765-43210", "919876543210" or a
 * bare 10-digit Indian mobile (which gets the 91 country code). Returns null when invalid.
 */
export function normalizeWhatsAppNumber(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 && /^[6-9]/.test(digits)) digits = `91${digits}`;
  return WHATSAPP_NUMBER_REGEX.test(digits) ? digits : null;
}

const MAX_URL_LENGTH = 7000;

export function buildWhatsAppUrl(number: string, message?: string): string {
  const n = normalizeWhatsAppNumber(number);
  if (!n) throw new Error("Invalid WhatsApp number");
  return message ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : `https://wa.me/${n}`;
}

/** Remove control characters and WhatsApp formatting markers from customer-typed text. */
export function cleanText(input: string, maxLength: number, multiline = false): string {
  let s = input.normalize("NFC").replace(/[*_~`]/g, "");
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "");
  s = multiline ? s.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  s = s.trim();
  return s.length > maxLength ? `${s.slice(0, maxLength - 1)}…` : s;
}

export const whatsappCustomerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80, "Name is too long"),
  phone: z
    .string()
    .refine(isValidIndianMobile, "Enter a valid 10-digit mobile number")
    .transform(normalizePhone),
  address: z.string().trim().min(8, "Enter house no., street and landmark").max(200, "Address is too long"),
  area: z.string().trim().max(80, "Area name is too long").optional().default(""),
  city: z.string().trim().min(2, "Enter your city").max(60),
  pincode: z
    .string()
    .transform((s) => s.replace(/\s+/g, ""))
    .pipe(z.string().regex(PINCODE_REGEX, "Enter a valid 6-digit PIN code")),
  notes: z.string().trim().max(200, "Keep notes under 200 characters").optional().default(""),
});
export type WhatsAppCustomer = z.output<typeof whatsappCustomerSchema>;
export type WhatsAppCustomerInput = z.input<typeof whatsappCustomerSchema>;

export interface WhatsAppOrderLine {
  name: string;
  variantLabel: string;
  quantity: number;
  unitPrice: Paise;
  lineTotal: Paise;
}

export interface WhatsAppOrder {
  storeName: string;
  reference: string;
  customer: WhatsAppCustomer;
  lines: WhatsAppOrderLine[];
  subtotal: Paise;
  discount: Paise;
  couponCode: string | null;
  /** null = delivery charge not known for this PIN code; seller confirms on WhatsApp. */
  deliveryFee: Paise | null;
  total: Paise;
  /** e.g. "Cash on delivery" — shown with its status, e.g. "UPI — payment pending". */
  paymentMethod?: string;
  paymentStatus?: string;
  /** Razorpay Payment Link for this order (server-created for the exact total). */
  payLink?: string | null;
  /** Secret tracking link for this order. */
  trackUrl?: string | null;
  /** Chosen delivery day + slot, e.g. "Fri, 16 Oct · Morning, 07:00–10:00". */
  delivery?: string | null;
  /** What to do if an item isn't available, e.g. "Call me about unavailable items". */
  ifUnavailable?: string | null;
}

/** Short human-friendly reference so the seller and customer can refer to the order. */
export function makeOrderReference(now = new Date(), random = Math.random): string {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const date = ist.toISOString().slice(2, 10).replace(/-/g, "");
  const code = Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(random() * 32)]).join("");
  return `WA-${date}-${code}`;
}

export function validateWhatsAppOrder(o: WhatsAppOrder): string | null {
  if (o.lines.length === 0) return "Your basket is empty.";
  for (const l of o.lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 99) return `Invalid quantity for ${l.name}.`;
    if (!Number.isInteger(l.unitPrice) || l.unitPrice < 0) return `Invalid price for ${l.name}.`;
    if (l.lineTotal !== l.unitPrice * l.quantity) return `Line total mismatch for ${l.name}.`;
  }
  const subtotal = o.lines.reduce((s, l) => s + l.lineTotal, 0);
  if (subtotal !== o.subtotal) return "Subtotal does not match the items.";
  if (o.discount < 0 || o.discount > o.subtotal) return "Invalid discount.";
  const expected = o.subtotal - o.discount + (o.deliveryFee ?? 0);
  if (expected !== o.total) return "Total does not add up.";
  return null;
}

/** Plain-text order message (WhatsApp formatting: *bold*). */
export function buildWhatsAppOrderMessage(o: WhatsAppOrder): string {
  const err = validateWhatsAppOrder(o);
  if (err) throw new Error(err);
  const c = o.customer;
  const lines: string[] = [];
  lines.push(`*New order — ${cleanText(o.storeName, 60)}*`);
  lines.push(`Order ID: ${o.reference}`);
  lines.push("");
  lines.push("*Customer*");
  lines.push(`Name: ${cleanText(c.name, 80)}`);
  lines.push(`Mobile: +91 ${c.phone}`);
  lines.push(`Address: ${cleanText(c.address, 200)}`);
  if (c.area) lines.push(`Area: ${cleanText(c.area, 80)}`);
  lines.push(`City / PIN: ${cleanText(c.city, 60)} - ${c.pincode}`);
  if (o.delivery) lines.push(`Delivery slot: ${cleanText(o.delivery, 80)}`);
  lines.push("");
  lines.push(`*Items (${o.lines.length})*`);
  o.lines.forEach((l, i) => {
    const label = l.variantLabel ? ` (${cleanText(l.variantLabel, 30)})` : "";
    lines.push(`${i + 1}. ${cleanText(l.name, 60)}${label} × ${l.quantity} = ${formatINR(l.lineTotal)}`);
  });
  lines.push("");
  lines.push(`Subtotal: ${formatINR(o.subtotal)}`);
  if (o.discount > 0) lines.push(`Discount${o.couponCode ? ` (${cleanText(o.couponCode, 32)})` : ""}: −${formatINR(o.discount)}`);
  lines.push(`Delivery: ${o.deliveryFee === null ? "to be confirmed" : o.deliveryFee === 0 ? "Free" : formatINR(o.deliveryFee)}`);
  lines.push(`*Total: ${formatINR(o.total)}*${o.deliveryFee === null ? " + delivery" : ""}`);
  if (o.paymentMethod) {
    lines.push(`Payment: ${cleanText(o.paymentMethod, 60)}${o.paymentStatus && o.paymentStatus !== o.paymentMethod ? ` (${cleanText(o.paymentStatus, 40)})` : ""}`);
  }
  if (o.payLink) lines.push(`Pay online: ${o.payLink}`);
  if (o.ifUnavailable) lines.push(`If an item isn't available: ${cleanText(o.ifUnavailable, 80)}`);
  if (c.notes) {
    lines.push("");
    lines.push(`Notes: ${cleanText(c.notes, 200, true)}`);
  }
  if (o.trackUrl) {
    lines.push("");
    lines.push(`Track order: ${o.trackUrl}`);
  }
  lines.push("");
  lines.push(o.delivery ? "Please confirm my order. Thank you!" : "Please confirm availability and delivery time. Thank you!");
  return lines.join("\n");
}

/** Builds the full wa.me link and checks it stays within a safe length. */
export function buildWhatsAppOrderUrl(number: string, order: WhatsAppOrder): string {
  const url = buildWhatsAppUrl(number, buildWhatsAppOrderMessage(order));
  if (url.length > MAX_URL_LENGTH) throw new Error("This order is too long to send in one WhatsApp message. Please remove a few items or shorten the notes.");
  return url;
}

import "server-only";
import { createHmac } from "node:crypto";
import { env } from "../env";
import { safeEqual } from "../tokens";

const API = "https://api.razorpay.com/v1";

function authHeader() {
  const { razorpayKeyId, razorpayKeySecret } = env.payments;
  if (!razorpayKeyId || !razorpayKeySecret) throw new Error("Razorpay is not configured");
  return "Basic " + Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64");
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: authHeader(), "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
  if (!res.ok) throw new Error(`Razorpay ${path} failed (${res.status}): ${body.error?.description ?? "unknown error"}`);
  return body;
}

export interface RazorpayOrder { id: string; amount: number; currency: string; receipt: string; status: string }
export interface RazorpayPayment { id: string; order_id: string; amount: number; currency: string; status: "created" | "authorized" | "captured" | "refunded" | "failed" }

export function createRazorpayOrder(args: { amount: number; receipt: string; orderId: string }) {
  return call<RazorpayOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({ amount: args.amount, currency: "INR", receipt: args.receipt, notes: { order_id: args.orderId } }),
  });
}

export interface RazorpayPaymentLink { id: string; short_url: string; status: string; amount: number; reference_id: string }

/**
 * Payment Link for one order: amount = the order total computed by the server; reference_id =
 * our order number (Razorpay rejects a second link with the same reference_id, so an order can't
 * get two different links by accident).
 */
export function createPaymentLink(args: {
  amount: number; orderNumber: string; orderId: string; description: string;
  customer: { name: string; contact: string }; callbackUrl: string; expireBy: number;
}) {
  return call<RazorpayPaymentLink>("/payment_links", {
    method: "POST",
    body: JSON.stringify({
      amount: args.amount,
      currency: "INR",
      accept_partial: false,
      reference_id: args.orderNumber,
      description: args.description.slice(0, 2048),
      customer: { name: args.customer.name.slice(0, 80), contact: args.customer.contact },
      notify: { sms: false, email: false },
      reminder_enable: false,
      expire_by: args.expireBy,
      notes: { order_id: args.orderId, order_number: args.orderNumber },
      callback_url: args.callbackUrl,
      callback_method: "get",
    }),
  });
}

export function fetchPayment(paymentId: string) {
  return call<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`);
}

export function capturePayment(paymentId: string, amount: number) {
  return call<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}/capture`, {
    method: "POST",
    body: JSON.stringify({ amount, currency: "INR" }),
  });
}

/** Checkout handler signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyCheckoutSignature(razorpayOrderId: string, paymentId: string, signature: string, secret = env.payments.razorpayKeySecret) {
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${razorpayOrderId}|${paymentId}`).digest("hex");
  return safeEqual(expected, signature);
}

/** Webhook signature: HMAC_SHA256(raw request body, webhook_secret) in X-Razorpay-Signature. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret = env.payments.razorpayWebhookSecret) {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

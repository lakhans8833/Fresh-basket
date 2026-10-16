import "server-only";
import QRCode from "qrcode";
import { buildUpiUri, formatINR, type Order, type StoreSettings } from "@freshbasket/shared";
import { tx } from "../db";
import { badRequest, conflict, notFound } from "../http";
import { scheduleOrderNotification } from "../notify/whatsapp";
import { CACHE_TAGS, invalidate } from "../cache";

export interface UpiPaymentInfo {
  upiId: string;
  payeeName: string | null;
  amount: number;
  /** upi://pay link with the exact amount and order number (opens the customer's UPI app). */
  uri: string;
  /** QR code (SVG markup) of the same link — scanning it fills in the exact amount. */
  qrSvg: string;
  /** The store's own uploaded QR image, if any (customer types the amount themselves). */
  qrImageUrl: string | null;
}

/** What the customer needs to pay a UPI order. null when the order isn't waiting for a UPI payment. */
export async function upiPaymentInfo(order: Order, settings: StoreSettings): Promise<UpiPaymentInfo | null> {
  if (order.paymentMethod !== "upi" || order.paymentStatus !== "pending" || order.status !== "pending_payment" || !settings.upiId) return null;
  const uri = buildUpiUri({ upiId: settings.upiId, payeeName: settings.upiPayeeName ?? settings.storeName, amount: order.total, orderNumber: order.orderNumber });
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b3d1f", light: "#ffffff" } });
  return { upiId: settings.upiId, payeeName: settings.upiPayeeName, amount: order.total, uri, qrSvg, qrImageUrl: settings.upiQrUrl };
}

/**
 * Customer says "I paid, here is my UTR". This is only a claim: the order stays
 * "payment pending" until staff see the money in the bank/UPI app and confirm it.
 */
export async function submitUpiReference(orderId: string, reference: string) {
  return tx(async (c) => {
    const { rows } = await c.query<{ status: string; payment_method: string; payment_status: string; upi_reference: string | null }>(
      "select status, payment_method, payment_status, upi_reference from orders where id = $1 for update",
      [orderId],
    );
    const o = rows[0];
    if (!o) throw notFound("Order not found.");
    if (o.payment_method !== "upi") throw badRequest("This order isn't paid by UPI.");
    if (o.payment_status !== "pending" || o.status !== "pending_payment") {
      throw conflict(o.payment_status === "paid" ? "This order is already marked paid." : "This order is no longer waiting for payment. Please contact the store.");
    }
    if (o.upi_reference === reference) return { reference, unchanged: true };
    await c.query("update orders set upi_reference = $2, upi_reference_at = now() where id = $1", [orderId, reference]);
    await c.query(
      "insert into order_events (order_id, status, note, actor) values ($1, 'pending_payment', $2, 'customer')",
      [orderId, `Customer reported a UPI payment, reference ${reference} — not verified yet`],
    );
    return { reference, unchanged: false };
  });
}

/**
 * Staff confirm that the UPI money for this order is in the store's account (checked in the bank or
 * UPI business app against the UTR). Records a payment (one per UTR) and marks the order paid.
 * Admin only; the confirming admin is written to the order history.
 */
export async function adminConfirmUpiPayment(orderId: string, actor: { id: string; email: string | null }, reference: string) {
  const out = await tx(async (c) => {
    const { rows } = await c.query<{ payment_method: string; payment_status: string; total: number; order_number: string }>(
      "select payment_method, payment_status, total, order_number from orders where id = $1 for update",
      [orderId],
    );
    const o = rows[0];
    if (!o) throw notFound("Order not found.");
    if (o.payment_method !== "upi") throw badRequest("Only UPI orders can be confirmed here.");
    if (o.payment_status === "paid") throw conflict("This order is already paid.");
    if (o.payment_status !== "pending" && o.payment_status !== "failed") {
      throw conflict("This order's payment is already settled (refund pending or refunded). Check it before recording more money.");
    }
    // One UTR confirms one order: lock on the UTR so two staff can't use it for two orders at once.
    await c.query("select pg_advisory_xact_lock(hashtext('upi_utr:' || $1))", [reference]);
    const used = await c.query<{ order_number: string }>(
      `select o.order_number from payments p join orders o on o.id = p.order_id
        where p.provider = 'upi_manual' and p.provider_payment_id = $1 and p.order_id <> $2 limit 1`,
      [reference, orderId],
    );
    if (used.rows[0]) throw conflict(`This UTR was already used to confirm order ${used.rows[0].order_number}.`);
    const { rows: r } = await c.query<{ result: string }>(
      "select mark_order_paid($1, 'upi_manual', null, $2, $3, 'admin') as result",
      [orderId, reference, o.total],
    );
    const result = r[0]!.result;
    if (result !== "paid" && result !== "paid_late") {
      // Nothing was marked paid (amount mismatch, already processed, refund needed): don't tell the customer it's confirmed.
      await c.query(
        "insert into order_events (order_id, status, note, actor) select id, status, $2, $3 from orders where id = $1",
        [orderId, `UPI reference ${reference} checked by staff — needs review (${result.replaceAll("_", " ")})`, `admin:${actor.id}`],
      );
      return { result };
    }
    await c.query("update orders set upi_reference = coalesce(upi_reference, $2) where id = $1", [orderId, reference]);
    // Who confirmed it is kept in the actor column (staff-only); the note is safe to show the customer.
    await c.query(
      "insert into order_events (order_id, status, note, actor) select id, status, $2, $3 from orders where id = $1",
      [orderId, `UPI payment of ${formatINR(o.total)} confirmed by the store (UTR ${reference})`, `admin:${actor.id}`],
    );
    return { result };
  });
  // Date/slot of a late-paid order are validated inside mark_order_paid (same transaction).
  if (out.result === "paid_late") invalidate(CACHE_TAGS.catalog); // stock re-taken
  if (out.result === "paid" || out.result === "paid_late") scheduleOrderNotification(orderId, "confirmed");
  return out;
}

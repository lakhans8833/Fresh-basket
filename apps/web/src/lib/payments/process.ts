import "server-only";
import { pool, tx } from "../db";
import { scheduleOrderNotification } from "../notify/whatsapp";
import { CACHE_TAGS, invalidate } from "../cache";

const confirmedOnPayment = (orderId: string | null | undefined, result: string) => {
  // A late payment re-takes stock: drop the cached catalogue so the shop shows it right away.
  // (Date/slot of a late-paid order is validated inside mark_order_paid, in the same transaction.)
  if (result === "paid_late") invalidate(CACHE_TAGS.catalog);
  if (orderId && (result === "paid" || result === "paid_late")) scheduleOrderNotification(orderId, "confirmed");
};

export type PaymentProvider = "razorpay" | "mock";

export interface NormalisedPaymentEvent {
  provider: PaymentProvider;
  eventId: string; // unique per delivery (webhook event id)
  type: "payment.captured" | "payment.failed" | "other";
  rawType: string;
  providerOrderId: string | null;
  paymentId: string | null;
  amount: number | null;
  orderId?: string | null; // our order id when the provider echoes it
  /** payment_link.paid: the link id, our order number (reference_id) and what Razorpay says was paid. */
  paymentLink?: { id: string | null; referenceId: string | null; amountPaid: number | null; status: string | null } | null;
  currency?: string | null;
  paymentStatus?: string | null;
  payload: unknown;
}

export type ProcessResult =
  | "duplicate"
  | "ignored"
  | "order_not_found"
  | "failed_recorded"
  | "paid"
  | "already_processed"
  | "paid_late"
  | "refund_required"
  | "amount_mismatch"
  /** The payment id was already recorded for a different order: not applied (needs review). */
  | "payment_reused"
  /** A second, different payment for an order that was already paid: flagged for refund. */
  | "duplicate_payment";

/**
 * Single entry point for webhook-style payment events. Stores the event once
 * (duplicates return "duplicate"), then updates the order inside the same transaction.
 */
export async function processPaymentEvent(ev: NormalisedPaymentEvent): Promise<ProcessResult> {
  let paidOrder: string | null = null;
  const result = await tx(async (c): Promise<ProcessResult> => {
    const ins = await c.query(
      `insert into payment_events (provider, event_id, event_type, payload) values ($1,$2,$3,$4)
       on conflict (provider, event_id) do nothing returning id`,
      [ev.provider, ev.eventId, ev.rawType, JSON.stringify(ev.payload)],
    );
    if (ins.rowCount === 0) return "duplicate";
    const eventRowId = ins.rows[0].id as number;

    const finish = async (result: ProcessResult) => {
      await c.query("update payment_events set result = $2 where id = $1", [eventRowId, result]);
      return result;
    };

    if (ev.type === "other" || !ev.paymentId) return finish("ignored");

    let orderId: string | undefined;
    if (ev.paymentLink) {
      // Payment Link: the link must belong to one of our link orders, be fully paid in INR by a
      // captured payment, and the amounts must agree (mark_order_paid also checks the order total).
      const l = ev.paymentLink;
      if (l.status !== "paid" || ev.paymentStatus !== "captured" || (ev.currency && ev.currency !== "INR")) return finish("ignored");
      if (l.amountPaid === null || ev.amount === null || l.amountPaid !== ev.amount) return finish("amount_mismatch");
      const { rows } = await c.query<{ id: string }>(
        `select id from orders where payment_method = 'razorpay_link'
            and (razorpay_payment_link_id = $1::text or ($1::text is null and order_number = $2::text))
          limit 1`,
        [l.id, l.referenceId],
      );
      orderId = rows[0]?.id;
    } else {
      const { rows } = await c.query<{ id: string }>(
        ev.orderId
          ? "select id from orders where id = $1"
          : "select id from orders where razorpay_order_id = $1",
        [ev.orderId ?? ev.providerOrderId],
      );
      orderId = rows[0]?.id;
    }
    if (!orderId) return finish("order_not_found");

    if (ev.type === "payment.failed") {
      await c.query(
        "insert into order_events (order_id, status, note, actor) select id, status, $2, 'system' from orders where id = $1",
        [orderId, `Payment attempt failed (${ev.paymentId}). Customer can retry until the reservation expires.`],
      );
      return finish("failed_recorded");
    }

    const { rows: r } = await c.query<{ result: ProcessResult }>(
      "select mark_order_paid($1, $2, $3, $4, $5, 'webhook') as result",
      [orderId, ev.provider, ev.providerOrderId, ev.paymentId, ev.amount],
    );
    paidOrder = orderId;
    return finish(r[0]!.result);
  });
  confirmedOnPayment(paidOrder, result);
  return result;
}

/** Used by the client-side "verify" call after the server has independently confirmed the payment. */
export async function markPaidFromVerifiedPayment(args: {
  orderId: string; provider: PaymentProvider; providerOrderId: string; paymentId: string; amount: number;
}): Promise<ProcessResult> {
  const result = await tx(async (c) => {
    const { rows } = await c.query<{ result: ProcessResult }>(
      "select mark_order_paid($1, $2, $3, $4, $5, 'client_verify') as result",
      [args.orderId, args.provider, args.providerOrderId, args.paymentId, args.amount],
    );
    return rows[0]!.result;
  });
  confirmedOnPayment(args.orderId, result);
  return result;
}

/** Normalise a Razorpay webhook body. */
export function normaliseRazorpayEvent(body: {
  event?: string;
  payload?: {
    payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string; currency?: string } };
    order?: { entity?: { id?: string } };
    payment_link?: { entity?: { id?: string; reference_id?: string; amount_paid?: number; status?: string } };
  };
}, eventId: string): NormalisedPaymentEvent {
  const p = body.payload?.payment?.entity;
  const link = body.payload?.payment_link?.entity;
  const rawType = body.event ?? "unknown";
  const type =
    rawType === "payment.captured" || rawType === "order.paid" || rawType === "payment_link.paid"
      ? "payment.captured"
      : rawType === "payment.failed"
        ? "payment.failed"
        : "other";
  return {
    paymentLink: rawType === "payment_link.paid"
      ? { id: link?.id ?? null, referenceId: link?.reference_id ?? null, amountPaid: typeof link?.amount_paid === "number" ? link.amount_paid : null, status: link?.status ?? null }
      : null,
    currency: p?.currency ?? null,
    paymentStatus: p?.status ?? null,
    provider: "razorpay",
    eventId,
    type,
    rawType,
    providerOrderId: p?.order_id ?? body.payload?.order?.entity?.id ?? null,
    paymentId: p?.id ?? null,
    amount: typeof p?.amount === "number" ? p.amount : null,
    payload: body,
  };
}

export { pool };

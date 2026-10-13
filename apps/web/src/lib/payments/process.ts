import "server-only";
import { pool, tx } from "../db";

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
  | "amount_mismatch";

/**
 * Single entry point for webhook-style payment events. Stores the event once
 * (duplicates return "duplicate"), then updates the order inside the same transaction.
 */
export async function processPaymentEvent(ev: NormalisedPaymentEvent): Promise<ProcessResult> {
  return tx(async (c) => {
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

    const { rows } = await c.query<{ id: string }>(
      ev.orderId
        ? "select id from orders where id = $1"
        : "select id from orders where razorpay_order_id = $1",
      [ev.orderId ?? ev.providerOrderId],
    );
    const orderId = rows[0]?.id;
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
    return finish(r[0]!.result);
  });
}

/** Used by the client-side "verify" call after the server has independently confirmed the payment. */
export async function markPaidFromVerifiedPayment(args: {
  orderId: string; provider: PaymentProvider; providerOrderId: string; paymentId: string; amount: number;
}): Promise<ProcessResult> {
  return tx(async (c) => {
    const { rows } = await c.query<{ result: ProcessResult }>(
      "select mark_order_paid($1, $2, $3, $4, $5, 'client_verify') as result",
      [args.orderId, args.provider, args.providerOrderId, args.paymentId, args.amount],
    );
    return rows[0]!.result;
  });
}

/** Normalise a Razorpay webhook body. */
export function normaliseRazorpayEvent(body: {
  event?: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } }; order?: { entity?: { id?: string } } };
}, eventId: string): NormalisedPaymentEvent {
  const p = body.payload?.payment?.entity;
  const rawType = body.event ?? "unknown";
  const type =
    rawType === "payment.captured" || rawType === "order.paid"
      ? "payment.captured"
      : rawType === "payment.failed"
        ? "payment.failed"
        : "other";
  return {
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

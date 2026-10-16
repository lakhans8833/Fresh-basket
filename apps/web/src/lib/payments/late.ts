import "server-only";
import { after } from "next/server";
import { isSlotBookable, istDateString, NO_SLOT_LABEL } from "@freshbasket/shared";
import { tx } from "../db";
import { toSlotRule } from "../delivery";

/**
 * An expired order that is paid later (late UPI confirmation / late webhook) comes back as "placed" with
 * its old delivery date and slot. If that date has passed, or the slot has meanwhile closed (cutoff) or
 * filled up, move it to today without a slot and leave a note, so it isn't booked into the past or into
 * a full/closed slot. The store agrees the delivery time with the customer.
 */
async function rescheduleIfNeeded(orderId: string) {
  await tx(async (c) => {
    const { rows } = await c.query<{ status: string; delivery_date: string; slot_id: string | null }>(
      "select status, to_char(delivery_date, 'YYYY-MM-DD') as delivery_date, slot_id from orders where id = $1 for update",
      [orderId],
    );
    const o = rows[0];
    if (!o || o.status !== "placed") return;
    const today = istDateString(new Date());
    let move = o.delivery_date < today;
    if (!move && o.slot_id) {
      const s = await c.query("select * from delivery_slots where id = $1 for update", [o.slot_id]);
      if (!s.rows[0]) move = true;
      else {
        // Other orders in this slot (this order itself doesn't count against the capacity check).
        const n = await c.query<{ n: string }>(
          "select count(*) as n from orders where slot_id = $1 and delivery_date = $2 and status <> 'cancelled' and id <> $3",
          [o.slot_id, o.delivery_date, orderId],
        );
        move = !isSlotBookable(toSlotRule(s.rows[0]), o.delivery_date, new Date(), Number(n.rows[0]?.n ?? 0));
      }
    }
    if (!move) return;
    await c.query("update orders set delivery_date = $2, slot_id = null, slot_label = $3 where id = $1", [orderId, today, NO_SLOT_LABEL]);
    await c.query("insert into order_events (order_id, status, note, actor) values ($1, 'placed', $2, 'system')", [
      orderId,
      "Paid after the delivery slot had closed — the store will agree a new delivery time with you.",
    ]);
  });
}

/** Runs after the response (or right away outside a request). Errors are logged only. */
export function reschedulePaidLate(orderId: string) {
  const run = () => rescheduleIfNeeded(orderId).catch((e) => console.error("[payments] reschedule late order failed", orderId, e));
  try {
    after(run);
  } catch {
    void run();
  }
}

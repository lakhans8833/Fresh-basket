import "server-only";
import { after } from "next/server";
import { NO_SLOT_LABEL } from "@freshbasket/shared";
import { query } from "../db";

/**
 * An expired order that is paid later (late UPI confirmation / late webhook) comes back as "placed" with
 * its old delivery date. If that date has already passed, move it to today without a slot and leave a
 * note for staff, so it isn't silently scheduled in the past (or counted against a closed slot).
 */
async function movePastDeliveryToToday(orderId: string) {
  const rows = await query<{ id: string }>(
    `update orders set delivery_date = (now() at time zone 'Asia/Kolkata')::date, slot_id = null, slot_label = $2
      where id = $1 and status = 'placed' and delivery_date < (now() at time zone 'Asia/Kolkata')::date
      returning id`,
    [orderId, NO_SLOT_LABEL],
  );
  if (rows[0]) {
    await query(
      "insert into order_events (order_id, status, note, actor) values ($1, 'placed', $2, 'system')",
      [orderId, "Paid after the delivery date had passed — the store will agree a new delivery time with you."],
    );
  }
}

/** Runs after the response (or right away outside a request). Errors are logged only. */
export function reschedulePaidLate(orderId: string) {
  const run = () => movePastDeliveryToToday(orderId).catch((e) => console.error("[payments] reschedule late order failed", orderId, e));
  try {
    after(run);
  } catch {
    void run();
  }
}

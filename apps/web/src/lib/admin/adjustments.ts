import "server-only";
import { formatINR, type AdminAdjustmentInput } from "@freshbasket/shared";
import { queryOne, tx } from "../db";
import { conflict, notFound } from "../http";
import { adminGetOrder } from "./orders";

/**
 * After delivery, items that were missing, damaged, spoiled or wrong are put right with a refund or a
 * replacement (returns policy §3). Rules:
 * - only for delivered orders;
 * - an item can't be claimed for more than was delivered (over all records together);
 * - a refund is at most the value of the chosen items, and all refunds together at most what was paid;
 * - refunds only once the money was actually received (paid online / cash collected).
 * Who may do what is decided by the route (refunds: admin only).
 */
export async function adminAddAdjustment(orderId: string, input: AdminAdjustmentInput, actorId: string) {
  await tx(async (c) => {
    const o = (
      await c.query<{ status: string; payment_status: string; total: number }>(
        "select status, payment_status, total from orders where id = $1 for update",
        [orderId],
      )
    ).rows[0];
    if (!o) throw notFound();
    if (o.status !== "delivered") throw conflict("Refunds and replacements are recorded once the order is delivered. Before that, cancel or edit the order instead.");
    if (input.kind === "refund" && !["paid", "cod_collected"].includes(o.payment_status)) {
      throw conflict(
        o.payment_status === "cod_pending"
          ? "Record the cash as collected first (if the customer paid less at the door, record what they paid and refund nothing)."
          : "This order has no payment to refund.",
      );
    }

    const lines = (
      await c.query<{ id: string; product_name: string; variant_label: string; unit_price: number; quantity: number }>(
        "select id, product_name, variant_label, unit_price, quantity from order_items where order_id = $1",
        [orderId],
      )
    ).rows;
    const byId = new Map(lines.map((l) => [l.id, l]));
    const previous = (
      await c.query<{ kind: string; amount: number; items: { itemId: string; quantity: number }[] }>(
        "select kind, amount, items from order_adjustments where order_id = $1",
        [orderId],
      )
    ).rows;
    const claimed = new Map<string, number>();
    for (const p of previous) for (const it of p.items) claimed.set(it.itemId, (claimed.get(it.itemId) ?? 0) + it.quantity);

    const merged = new Map<string, number>();
    for (const it of input.items) merged.set(it.itemId, (merged.get(it.itemId) ?? 0) + it.quantity);
    let itemsValue = 0;
    const snapshot: { itemId: string; name: string; label: string; quantity: number }[] = [];
    for (const [itemId, qty] of merged) {
      const line = byId.get(itemId);
      if (!line) throw conflict("That item isn't part of this order.");
      const left = line.quantity - (claimed.get(itemId) ?? 0);
      if (qty > left) {
        throw conflict(
          left <= 0
            ? `${line.product_name} (${line.variant_label}) has already been refunded or replaced in full.`
            : `Only ${left} × ${line.product_name} (${line.variant_label}) can still be refunded or replaced.`,
        );
      }
      itemsValue += line.unit_price * qty;
      snapshot.push({ itemId, name: line.product_name, label: line.variant_label, quantity: qty });
    }

    if (input.kind === "refund") {
      if (input.amount > itemsValue) throw conflict(`A refund for these items can be at most ${formatINR(itemsValue)}.`);
      const refunded = previous.filter((p) => p.kind === "refund").reduce((s, p) => s + p.amount, 0);
      if (refunded + input.amount > o.total) {
        throw conflict(`Refunds can't add up to more than the ${formatINR(o.total)} paid (${formatINR(refunded)} already recorded).`);
      }
    }

    await c.query(
      `insert into order_adjustments (order_id, kind, items, amount, reason, created_by) values ($1, $2, $3, $4, $5, $6)`,
      [orderId, input.kind, JSON.stringify(snapshot), input.kind === "refund" ? input.amount : 0, input.reason, `admin:${actorId}`],
    );
    const what = snapshot.map((s) => `${s.quantity} × ${s.name} (${s.label})`).join(", ");
    await c.query("insert into order_events (order_id, status, note, actor) values ($1, 'delivered', $2, $3)", [
      orderId,
      input.kind === "refund" ? `Refund of ${formatINR(input.amount)} for ${what}: ${input.reason}` : `Replacement for ${what}: ${input.reason}`,
      `admin:${actorId}`,
    ]);
  });
  return adminGetOrder(orderId);
}

/** Refund sent / replacement delivered. */
export async function adminCompleteAdjustment(orderId: string, adjustmentId: string, actorId: string) {
  await tx(async (c) => {
    const a = (
      await c.query<{ kind: string; amount: number; status: string }>(
        "select kind, amount, status from order_adjustments where id = $1 and order_id = $2 for update",
        [adjustmentId, orderId],
      )
    ).rows[0];
    if (!a) throw notFound();
    if (a.status === "done") return; // already done: nothing to change
    await c.query("update order_adjustments set status = 'done', done_by = $2, done_at = now() where id = $1", [adjustmentId, `admin:${actorId}`]);
    await c.query("insert into order_events (order_id, status, note, actor) values ($1, 'delivered', $2, $3)", [
      orderId,
      a.kind === "refund" ? `Refund of ${formatINR(a.amount)} sent` : "Replacement delivered",
      `admin:${actorId}`,
    ]);
  });
  return adminGetOrder(orderId);
}

export async function adjustmentKind(orderId: string, adjustmentId: string): Promise<string | null> {
  const r = await queryOne<{ kind: string }>("select kind from order_adjustments where id = $1 and order_id = $2", [adjustmentId, orderId]);
  return r?.kind ?? null;
}

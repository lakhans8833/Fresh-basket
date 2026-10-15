import "server-only";
import { canAdminTransition, type OrderStatus, type PaymentStatus } from "@freshbasket/shared";
import { pool, query, tx } from "../db";
import { conflict, notFound } from "../http";
import { getOrderById, hydrateOrders, releaseExpired, type OrderRow } from "../orders";
import { notifyEventForStatus, orderNotifications, scheduleOrderNotification } from "../notify/whatsapp";
import { cancelPaymentLinkFor } from "../payments/link-cancel";

/**
 * A "placed" order whose delivery slot has already ended (India time) — nobody has packed it yet.
 * Needs `left join delivery_slots s on s.id = o.slot_id`; if the slot was deleted, the end of the
 * delivery day counts.
 */
export const LATE_SQL = `(o.status = 'placed' and coalesce(o.delivery_date + s.end_time, o.delivery_date + interval '1 day') at time zone 'Asia/Kolkata' < now())`;

export async function adminListOrders(f: { status?: string | null; q?: string | null; date?: string | null; limit?: number }) {
  await releaseExpired();
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.status === "late") {
    where.push(LATE_SQL);
  } else if (f.status === "whatsapp") {
    where.push("o.channel = 'whatsapp'");
  } else if (f.status) {
    params.push(f.status);
    where.push(`o.status = $${params.length}`);
  }
  if (f.date) {
    params.push(f.date);
    where.push(`o.delivery_date = $${params.length}::date`);
  }
  if (f.q) {
    params.push(`%${f.q.toLowerCase()}%`);
    where.push(`(lower(o.order_number) like $${params.length} or lower(o.address->>'fullName') like $${params.length} or o.address->>'phone' like $${params.length})`);
  }
  params.push(f.limit ?? 200);
  return query(
    `select o.id, o.order_number as "orderNumber", o.status, o.payment_method as "paymentMethod", o.payment_status as "paymentStatus",
            o.total, to_char(o.delivery_date, 'YYYY-MM-DD') as "deliveryDate", o.slot_label as "slotLabel",
            o.address->>'fullName' as "customerName", o.address->>'pincode' as pincode, o.created_at as "createdAt",
            (select count(*)::int from order_items i where i.order_id = o.id) as "itemCount",
            ${LATE_SQL} as late, o.channel
       from orders o left join delivery_slots s on s.id = o.slot_id ${where.length ? "where " + where.join(" and ") : ""}
      order by o.created_at desc limit $${params.length}`,
    params,
  );
}

export async function adminGetOrder(id: string) {
  const o = await getOrderById(id);
  if (!o) throw notFound();
  const payments = await query(
    `select provider, provider_payment_id as "paymentId", amount, status, source, created_at as "createdAt" from payments where order_id = $1 order by created_at`,
    [id],
  );
  const customer = await query(`select email, full_name as "fullName", phone from profiles where id = $1`, [o.userId]);
  const late = await query<{ late: boolean }>(`select ${LATE_SQL} as late from orders o left join delivery_slots s on s.id = o.slot_id where o.id = $1`, [id]);
  const notifications = await orderNotifications(id);
  return { ...o, payments, customer: customer[0] ?? null, late: late[0]?.late ?? false, notifications };
}

export async function adminUpdateOrderStatus(id: string, to: OrderStatus, actorId: string, note?: string | null) {
  await tx(async (c) => {
    const { rows } = await c.query<{ status: OrderStatus }>("select status from orders where id = $1 for update", [id]);
    const from = rows[0]?.status;
    if (!from) throw notFound();
    if (!canAdminTransition(from, to)) throw conflict(`An order that is "${from.replaceAll("_", " ")}" can't be moved to "${to.replaceAll("_", " ")}".`);
    if (to === "cancelled") {
      await c.query("select cancel_order($1, $2, $3)", [id, `admin:${actorId}`, note || "Cancelled by store"]);
      return;
    }
    await c.query("update orders set status = $2 where id = $1", [id, to]);
    await c.query("insert into order_events (order_id, status, note, actor) values ($1,$2,$3,$4)", [id, to, note ?? null, `admin:${actorId}`]);
  });
  // Customer's WhatsApp update (packed / out for delivery / delivered), once per event.
  scheduleOrderNotification(id, notifyEventForStatus(to));
  if (to === "cancelled") cancelPaymentLinkFor(id);
  return adminGetOrder(id);
}

/** Manual payment bookkeeping that only staff can confirm offline. */
const PAYMENT_TRANSITIONS: Partial<Record<PaymentStatus, PaymentStatus[]>> = {
  cod_pending: ["cod_collected"],
  cod_cancelled: [],
  refund_pending: ["refunded"],
};

export async function adminUpdatePaymentStatus(id: string, to: PaymentStatus, actorId: string) {
  await tx(async (c) => {
    const { rows } = await c.query<{ status: OrderStatus; payment_status: PaymentStatus }>(
      "select status, payment_status from orders where id = $1 for update",
      [id],
    );
    const o = rows[0];
    if (!o) throw notFound();
    if (!(PAYMENT_TRANSITIONS[o.payment_status] ?? []).includes(to)) throw conflict("That payment update isn't allowed for this order.");
    if (to === "cod_collected" && o.status !== "delivered") throw conflict("Mark the order delivered before recording cash collected.");
    await c.query("update orders set payment_status = $2 where id = $1", [id, to]);
    await c.query("insert into order_events (order_id, status, note, actor) values ($1,$2,$3,$4)", [
      id, o.status, to === "cod_collected" ? "Cash collected" : "Refund completed", `admin:${actorId}`,
    ]);
  });
  return adminGetOrder(id);
}

/**
 * Everything the dashboard shows, in one call: expired holds are released first (so the counts are
 * right), then the counts, recent orders and low-stock list are read in parallel.
 */
export async function adminStats() {
  await releaseExpired();
  const [counts, recentRows, lowStock] = await Promise.all([
    query<Record<string, number>>(
      `select
         (select count(*)::int from orders where created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') as "ordersToday",
         (select coalesce(sum(total),0)::int from orders where status <> 'cancelled' and payment_status in ('paid','cod_pending','cod_collected')
            and created_at >= date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') as "revenueToday",
         (select count(*)::int from orders where status in ('placed','packed')) as "toFulfil",
         (select count(*)::int from orders o left join delivery_slots s on s.id = o.slot_id where ${LATE_SQL}) as "lateOrders",
         (select count(*)::int from orders where status = 'out_for_delivery') as "outForDelivery",
         (select count(*)::int from orders where status = 'pending_payment') as "awaitingPayment",
         (select count(*)::int from orders where payment_status = 'refund_pending') as "refundsPending",
         (select count(*)::int from product_variants where active and stock <= 5) as "lowStockCount",
         (select count(*)::int from support_messages where status = 'open') as "openMessages"`,
    ),
    query<OrderRow>(
      `select o.id, o.order_number, o.user_id, o.status, o.payment_method, o.payment_status, o.subtotal, o.discount, o.coupon_code,
              o.delivery_fee, o.total, to_char(o.delivery_date,'YYYY-MM-DD') as delivery_date, o.slot_label, o.address, o.customer_note,
              o.reservation_expires_at, o.razorpay_order_id, o.created_at
         from orders o order by created_at desc limit 8`,
    ),
    query(
      `select v.id as "variantId", p.name as "productName", v.label, v.stock from product_variants v join products p on p.id = v.product_id
        where v.active and p.active and v.stock <= 5 order by v.stock, p.name limit 10`,
    ),
  ]);
  return { ...counts[0], recent: await hydrateOrders(pool, recentRows), lowStock };
}

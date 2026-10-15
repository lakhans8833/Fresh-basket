import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  addDays, canCustomerCancel, istDateString, pincodeStateMessage, stateMatchesPincode,
  type Order, type OrderStatus, type PaymentMethod, type PaymentStatus, type PlaceOrderInput,
} from "@freshbasket/shared";
import { asUser, pool, query, tx } from "./db";
import { env } from "./env";
import { conflict, badRequest, notFound, HttpError } from "./http";
import { buildQuote, quoteMessages } from "./quote";
import { lockAndCheckSlot } from "./delivery";
import { getSettings, supportedPaymentMethods } from "./settings";

type Q = Pick<PoolClient, "query">;

export type OrderRow = {
  id: string; order_number: string; user_id: string; status: OrderStatus; payment_method: PaymentMethod;
  payment_status: PaymentStatus; subtotal: number; discount: number; coupon_code: string | null; delivery_fee: number;
  total: number; delivery_date: string; slot_label: string; address: Order["address"]; customer_note: string | null;
  reservation_expires_at: Date | null; razorpay_order_id: string | null; created_at: Date;
};

const ORDER_COLUMNS = `o.id, o.order_number, o.user_id, o.status, o.payment_method, o.payment_status, o.subtotal, o.discount,
  o.coupon_code, o.delivery_fee, o.total, to_char(o.delivery_date, 'YYYY-MM-DD') as delivery_date, o.slot_label, o.address,
  o.customer_note, o.reservation_expires_at, o.razorpay_order_id, o.created_at`;

export async function hydrateOrders(db: Q, rows: OrderRow[]): Promise<Order[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const { rows: items } = await db.query<{
    order_id: string; variant_id: string | null; product_id: string | null; product_name: string; variant_label: string;
    unit_price: number; quantity: number; line_total: number; image_url: string | null;
  }>("select * from order_items where order_id = any($1::uuid[]) order by product_name", [ids]);
  const { rows: events } = await db.query<{ order_id: string; status: OrderStatus; note: string | null; created_at: Date }>(
    "select order_id, status, note, created_at from order_events where order_id = any($1::uuid[]) order by created_at, id",
    [ids],
  );
  return rows.map((r) => ({
    id: r.id,
    orderNumber: r.order_number,
    status: r.status,
    paymentMethod: r.payment_method,
    paymentStatus: r.payment_status,
    subtotal: r.subtotal,
    discount: r.discount,
    couponCode: r.coupon_code,
    deliveryFee: r.delivery_fee,
    total: r.total,
    deliveryDate: r.delivery_date,
    slotLabel: r.slot_label,
    address: r.address,
    customerNote: r.customer_note,
    reservationExpiresAt: r.reservation_expires_at ? r.reservation_expires_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    items: items
      .filter((i) => i.order_id === r.id)
      .map((i) => ({
        variantId: i.variant_id, productId: i.product_id, productName: i.product_name, variantLabel: i.variant_label,
        unitPrice: i.unit_price, quantity: i.quantity, lineTotal: i.line_total, imageUrl: i.image_url,
      })),
    events: events
      .filter((e) => e.order_id === r.id)
      .map((e) => ({ status: e.status, note: e.note, createdAt: e.created_at.toISOString() })),
  }));
}

/* ------------------------------------------------------------------ */
/* Customer reads (row-level security enforced)                        */
/* ------------------------------------------------------------------ */

export async function listMyOrders(userId: string, limit = 50): Promise<Order[]> {
  return asUser(userId, async (c) => {
    const { rows } = await c.query<OrderRow>(
      `select ${ORDER_COLUMNS} from orders o where o.user_id = auth.uid() order by o.created_at desc limit $1`,
      [limit],
    );
    return hydrateOrders(c, rows);
  });
}

export async function getMyOrder(userId: string, orderId: string): Promise<Order | null> {
  return asUser(userId, async (c) => {
    // RLS hides other customers' orders even without the user_id filter.
    const { rows } = await c.query<OrderRow>(`select ${ORDER_COLUMNS} from orders o where o.id = $1`, [orderId]);
    const [o] = await hydrateOrders(c, rows);
    return o ?? null;
  });
}

/** Privileged read used by the payment page when opened with a signed pay token. */
export async function getOrderById(orderId: string, db: Q = pool): Promise<(Order & { userId: string; razorpayOrderId: string | null }) | null> {
  const { rows } = await db.query<OrderRow>(`select ${ORDER_COLUMNS} from orders o where o.id = $1`, [orderId]);
  const [o] = await hydrateOrders(db, rows);
  return o ? { ...o, userId: rows[0]!.user_id, razorpayOrderId: rows[0]!.razorpay_order_id } : null;
}

/* ------------------------------------------------------------------ */
/* Place order                                                         */
/* ------------------------------------------------------------------ */

type AddressSnapshot = Order["address"];

export class OrderRejected extends HttpError {
  constructor(message: string, public messages: Record<string, string>) {
    super(409, message, "ORDER_REJECTED", { messages });
  }
}

export async function releaseExpired(): Promise<number> {
  const rows = await query<{ n: number }>("select release_expired_reservations() as n");
  return rows[0]?.n ?? 0;
}

/**
 * Creates an order with server-computed totals and reserves stock atomically.
 * - Variant + coupon rows are locked FOR UPDATE; stock is decremented with a guarded UPDATE
 *   (and a CHECK constraint), so concurrent checkouts cannot oversell.
 * - The slot row is locked so slot capacity is enforced.
 * - (user_id, idempotency_key) is unique, so retries return the original order.
 */
export async function placeOrder(userId: string, input: PlaceOrderInput): Promise<{ order: Order; created: boolean }> {
  const settings = await getSettings();
  const methods = supportedPaymentMethods(settings);
  if (!methods.includes(input.paymentMethod)) {
    throw badRequest("That payment method isn't available right now.");
  }

  // Bound the delivery date to the configured window (IST).
  const today = istDateString(new Date());
  const lastDay = addDays(today, settings.slotDaysAhead - 1);
  if (input.deliveryDate < today || input.deliveryDate > lastDay) throw badRequest("Please choose a delivery date shown at checkout.");

  await releaseExpired();

  const existing = await query<{ id: string }>("select id from orders where user_id = $1 and idempotency_key = $2", [userId, input.idempotencyKey]);
  if (existing[0]) return { order: (await getOrderById(existing[0].id))!, created: false };

  // What is being ordered — identical resubmits within 2 minutes return the first order.
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        items: [...input.items].map((i) => [i.variantId, i.quantity]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        addressId: input.addressId ?? null,
        address: input.address
          ? [input.address.fullName, input.address.phone, input.address.line1, input.address.line2 ?? "", input.address.pincode].map((x) => String(x).trim().toLowerCase())
          : null,
        slot: input.slotId,
        date: input.deliveryDate,
        pay: input.paymentMethod,
        coupon: (input.couponCode ?? "").trim().toUpperCase(),
      }),
    )
    .digest("hex");

  try {
    const result = await tx(async (c): Promise<{ id: string; created: boolean }> => {
      // One order placement at a time per customer, so two simultaneous submits can't both pass the check below.
      await c.query("select pg_advisory_xact_lock(hashtext('place_order:' || $1))", [userId]);
      const dup = await c.query<{ id: string }>(
        `select id from orders
          where user_id = $1 and (idempotency_key = $2 or (request_fingerprint = $3 and created_at > now() - interval '2 minutes' and status <> 'cancelled'))
          order by created_at desc limit 1`,
        [userId, input.idempotencyKey, fingerprint],
      );
      if (dup.rows[0]) return { id: dup.rows[0].id, created: false };

      // Resolve the delivery address (saved address must belong to the user).
      let address: AddressSnapshot;
      if (input.addressId) {
        const { rows } = await c.query(
          "select label, full_name, phone, line1, line2, landmark, city, state, pincode from addresses where id = $1 and user_id = $2",
          [input.addressId, userId],
        );
        const a = rows[0];
        if (!a) throw badRequest("Saved address not found.");
        if (!stateMatchesPincode(a.state, a.pincode)) {
          throw badRequest(`Your saved address "${a.label}" says ${a.state}, but ${pincodeStateMessage(a.pincode)} Edit the address in My addresses and try again.`);
        }
        address = { label: a.label, fullName: a.full_name, phone: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state, pincode: a.pincode };
      } else {
        const a = input.address!;
        address = { label: a.label, fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2 ?? null, landmark: a.landmark ?? null, city: a.city, state: a.state, pincode: a.pincode };
        if (input.saveAddress) {
          const { rows: cnt } = await c.query<{ n: string }>("select count(*) as n from addresses where user_id = $1", [userId]);
          const first = Number(cnt[0]?.n ?? 0) === 0;
          // Don't save the same address twice (repeat orders to the same place).
          await c.query(
            `insert into addresses (user_id, label, full_name, phone, line1, line2, landmark, city, state, pincode, is_default)
             select $1::uuid, $2::text, $3::text, $4::text, $5::text, $6::text, $7::text, $8::text, $9::text, $10::text, $11::boolean
             where not exists (
               select 1 from addresses x
               where x.user_id = $1 and x.pincode = $10
                 and lower(btrim(x.line1)) = lower(btrim($5)) and lower(btrim(coalesce(x.line2, ''))) = lower(btrim(coalesce($6, '')))
                 and lower(btrim(x.full_name)) = lower(btrim($3)) and x.phone = $4
             )`,
            [userId, a.label, a.fullName, a.phone, a.line1, a.line2 ?? null, a.landmark ?? null, a.city, a.state, a.pincode, first],
          );
        }
      }

      const ctx = await buildQuote(
        { items: input.items, couponCode: input.couponCode, pincode: address.pincode },
        { userId, db: c, lock: true, deliveryRequired: true },
      );
      if (!ctx.quote.ok) {
        throw new OrderRejected("Some items in your basket need attention.", quoteMessages(ctx.quote));
      }

      const slot = await lockAndCheckSlot(c, input.slotId, input.deliveryDate);
      if (!slot.ok) throw new OrderRejected(slot.reason, { _slot: slot.reason });

      const online = input.paymentMethod !== "cod";
      const { rows: orows } = await c.query<{ id: string }>(
        `insert into orders (user_id, status, payment_method, payment_status, subtotal, discount, coupon_id, coupon_code,
                             delivery_fee, total, delivery_date, slot_id, slot_label, address, customer_note, idempotency_key,
                             reservation_expires_at, request_fingerprint)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
                 case when $17::boolean then now() + make_interval(mins => $18::int) end, $19)
         returning id`,
        [
          userId, online ? "pending_payment" : "placed", input.paymentMethod, online ? "pending" : "cod_pending",
          ctx.quote.subtotal, ctx.quote.discount, ctx.couponId, ctx.quote.couponCode, ctx.quote.deliveryFee, ctx.quote.total,
          input.deliveryDate, input.slotId,
          `${slot.rule.label}, ${slot.rule.startTime}–${slot.rule.endTime}`,
          JSON.stringify(address), input.customerNote ?? null, input.idempotencyKey,
          online, env.payments.reservationMinutes, fingerprint,
        ],
      );
      const id = orows[0]!.id;

      for (const line of ctx.quote.lines) {
        const meta = ctx.variants.get(line.variantId)!;
        // Guarded take: from the product's total grams for weight packs, else from the pack itself.
        // Succeeds only if enough stock remains (product + pack rows are already locked).
        const took = await c.query<{ ok: boolean }>("select take_stock($1, $2) as ok", [line.variantId, line.quantity]);
        if (!took.rows[0]?.ok) throw new OrderRejected("An item just went out of stock.", { [line.variantId]: "Out of stock." });
        await c.query(
          `insert into order_items (order_id, product_id, variant_id, product_name, variant_label, unit_price, quantity, line_total, image_url)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [id, meta.productId, line.variantId, line.productName, line.variantLabel, line.unitPrice, line.quantity, line.lineTotal, meta.imageUrl],
        );
      }

      if (ctx.couponId) {
        await c.query("insert into coupon_redemptions (coupon_id, order_id, user_id) values ($1,$2,$3)", [ctx.couponId, id, userId]);
        await c.query("update coupons set used_count = used_count + 1 where id = $1", [ctx.couponId]);
      }

      // Fill the customer's profile name / mobile from their first order if they haven't set them yet.
      await c.query(
        "update profiles set full_name = coalesce(nullif(trim(full_name), ''), $2), phone = coalesce(nullif(trim(phone), ''), $3) where id = $1",
        [userId, address.fullName, address.phone],
      );

      await c.query("insert into order_events (order_id, status, note, actor) values ($1,$2,$3,'customer')", [
        id,
        online ? "pending_payment" : "placed",
        online ? `Waiting for payment (stock held for ${env.payments.reservationMinutes} minutes)` : "Order placed — pay on delivery",
      ]);
      return { id, created: true };
    });
    return { order: (await getOrderById(result.id))!, created: result.created };
  } catch (e) {
    // Concurrent retry with the same idempotency key.
    if ((e as { code?: string }).code === "23505" && String((e as { constraint?: string }).constraint).includes("idempotency")) {
      const again = await query<{ id: string }>("select id from orders where user_id = $1 and idempotency_key = $2", [userId, input.idempotencyKey]);
      if (again[0]) return { order: (await getOrderById(again[0].id))!, created: false };
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* Cancel / reorder                                                    */
/* ------------------------------------------------------------------ */

export async function cancelOrder(orderId: string, actor: string, reason: string) {
  return tx(async (c) => {
    await c.query("select cancel_order($1, $2, $3)", [orderId, actor, reason]);
  });
}

export async function customerCancel(userId: string, orderId: string) {
  const order = await getMyOrder(userId, orderId);
  if (!order) throw notFound("Order not found.");
  if (!canCustomerCancel(order.status)) throw conflict("This order can no longer be cancelled. Please contact support.");
  await cancelOrder(orderId, "customer", "Cancelled by customer");
  return getMyOrder(userId, orderId);
}

/** Items from a past order that can be added to the basket again at today's prices. */
export async function reorderItems(userId: string, orderId: string) {
  const order = await getMyOrder(userId, orderId);
  if (!order) throw notFound("Order not found.");
  const ids = order.items.map((i) => i.variantId).filter((x): x is string => Boolean(x));
  const rows = await query<{ id: string; stock: number; active: boolean; slug: string }>(
    `select v.id, v.stock, (v.active and p.active) as active, p.slug from product_variants v join products p on p.id = v.product_id where v.id = any($1::uuid[])`,
    [ids],
  );
  const avail = new Map(rows.map((r) => [r.id, r]));
  const added: { variantId: string; quantity: number; productSlug: string }[] = [];
  const skipped: string[] = [];
  for (const it of order.items) {
    const v = it.variantId ? avail.get(it.variantId) : undefined;
    if (!v || !v.active || v.stock <= 0) {
      skipped.push(`${it.productName} (${it.variantLabel})`);
      continue;
    }
    added.push({ variantId: v.id, quantity: Math.min(it.quantity, v.stock), productSlug: v.slug });
  }
  return { items: added, skipped };
}

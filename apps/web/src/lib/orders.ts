import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  addDays, canCustomerCancel, istDateString, pincodeStateMessage, PREPAID_METHODS, stateMatchesPincode,
  type Order, type OrderStatus, type PaymentMethod, type PaymentStatus, type PlaceOrderInput, type WhatsAppOrderInput, NO_SLOT_LABEL, MAX_QTY_PER_LINE } from "@freshbasket/shared";
import { asUser, pool, query, tx } from "./db";
import { CACHE_TAGS, invalidate } from "./cache";
import { env } from "./env";
import { conflict, badRequest, notFound, HttpError } from "./http";
import { buildQuote, quoteMessages } from "./quote";
import { lockAndCheckSlot } from "./delivery";
import { getSettings, supportedPaymentMethods, whatsappPaymentMethods } from "./settings";
import { scheduleOrderNotification } from "./notify/whatsapp";
import { cancelPaymentLinkFor } from "./payments/link-cancel";

type Q = Pick<PoolClient, "query">;

export type OrderRow = {
  id: string; order_number: string; user_id: string; status: OrderStatus; payment_method: PaymentMethod;
  payment_status: PaymentStatus; subtotal: number; discount: number; coupon_code: string | null; delivery_fee: number;
  total: number; delivery_date: string; slot_label: string; address: Order["address"]; customer_note: string | null;
  reservation_expires_at: Date | null; razorpay_order_id: string | null; created_at: Date;
  channel: "web" | "whatsapp"; upi_reference: string | null; razorpay_payment_link_url: string | null; whatsapp_updates: boolean;
  unavailable_item_preference?: "call" | "remove" | null;
};

const ORDER_COLUMNS = `o.id, o.order_number, o.user_id, o.status, o.payment_method, o.payment_status, o.subtotal, o.discount,
  o.coupon_code, o.delivery_fee, o.total, to_char(o.delivery_date, 'YYYY-MM-DD') as delivery_date, o.slot_label, o.address,
  o.customer_note, o.unavailable_item_preference, o.reservation_expires_at, o.razorpay_order_id, o.created_at,
  o.channel, o.upi_reference, o.razorpay_payment_link_url, o.whatsapp_updates`;

export async function hydrateOrders(db: Q, rows: OrderRow[]): Promise<Order[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  // Both lookups at once (on a pool they run in parallel; on one client they simply queue).
  const [{ rows: items }, { rows: events }] = await Promise.all([
    db.query<{
      order_id: string; variant_id: string | null; product_id: string | null; product_name: string; variant_label: string;
      unit_price: number; quantity: number; line_total: number; image_url: string | null;
    }>("select * from order_items where order_id = any($1::uuid[]) order by product_name", [ids]),
    db.query<{ order_id: string; status: OrderStatus; note: string | null; created_at: Date }>(
      "select order_id, status, note, created_at from order_events where order_id = any($1::uuid[]) order by created_at, id",
      [ids],
    ),
  ]);
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
    unavailableItems: r.unavailable_item_preference ?? null,
    reservationExpiresAt: r.reservation_expires_at ? r.reservation_expires_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    channel: r.channel ?? "web",
    upiReference: r.upi_reference ?? null,
    // The link is only useful while the order still waits for payment.
    paymentLinkUrl: r.payment_status === "pending" ? (r.razorpay_payment_link_url ?? null) : null,
    whatsappUpdates: Boolean(r.whatsapp_updates),
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
    // Own orders only (RLS would also let staff read every order through this customer path).
    const { rows } = await c.query<OrderRow>(`select ${ORDER_COLUMNS} from orders o where o.id = $1 and o.user_id = auth.uid()`, [orderId]);
    const [o] = await hydrateOrders(c, rows);
    return o ?? null;
  });
}

/** Privileged read used by the payment page when opened with a signed pay token. */
export async function getOrderById(orderId: string, db: Q = pool): Promise<(Order & { userId: string | null; razorpayOrderId: string | null }) | null> {
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
  const n = rows[0]?.n ?? 0;
  // Stock came back: drop the cached catalogue (this also runs from GET requests, e.g. Admin → Orders).
  if (n > 0) invalidate(CACHE_TAGS.catalog);
  return n;
}

/** How long stock is held for orders paid by UPI (checked by staff) or a payment link. */
export const MANUAL_PAYMENT_HOLD_MINUTES = 24 * 60;
/**
 * Guests (no account) get a shorter hold and at most 2 unpaid UPI/link orders per mobile number,
 * so nobody can block the shop's stock with fake unpaid orders. A payment confirmed after the hold
 * still re-reserves the stock (or is flagged for refund if it's gone).
 */
export const GUEST_PAYMENT_HOLD_MINUTES = 3 * 60;
/** Open (unpaid or unconfirmed) guest orders allowed per mobile number, so fake orders can't block stock. */
const GUEST_OPEN_LIMIT = 2;
/** WhatsApp cash orders the store hasn't confirmed within this time are cancelled and their stock released. */
export const CONFIRM_HOLD_MINUTES = 24 * 60;
/** Guests (no account, unverified mobile) get a shorter wait, so fake orders can't hold stock for long. */
export const GUEST_CONFIRM_HOLD_MINUTES = 12 * 60;
/** Most unconfirmed guest orders allowed shop-wide at once (stops a flood of fake orders with random numbers). */
const GUEST_UNCONFIRMED_SHOP_LIMIT = 40;

function holdMinutesFor(method: PaymentMethod): number | null {
  if (method === "cod") return null;
  if (method === "upi" || method === "razorpay_link") return MANUAL_PAYMENT_HOLD_MINUTES;
  return env.payments.reservationMinutes;
}

function orderFingerprint(parts: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

interface CoreOrder {
  userId: string | null;
  address: AddressSnapshot;
  items: PlaceOrderInput["items"];
  couponCode: string | null | undefined;
  paymentMethod: PaymentMethod;
  channel: "web" | "whatsapp";
  deliveryDate: string;
  customerNote: string | null | undefined;
  unavailableItems: "call" | "remove";
  idempotencyKey: string;
  fingerprint: string;
  whatsappUpdates: boolean;
  /** Locks and checks the delivery slot (after the stock rows are locked). null = no slot (WhatsApp orders). */
  slot: ((c: PoolClient) => Promise<{ id: string; label: string }>) | null;
  /** Override the stock hold for prepaid methods (minutes). */
  holdMinutes?: number;
  /** Cash-on-delivery orders that the store must confirm first (WhatsApp orders). Stock is still reserved. */
  needsConfirmation?: boolean;
}

/**
 * Inside a transaction: server-side quote with locked rows, guarded stock take, order + items +
 * coupon + history. Prepaid methods start as "pending_payment" (stock held), COD as "placed"
 * (or "pending_confirmation" for WhatsApp orders, until staff confirm them).
 */
async function insertOrder(c: PoolClient, o: CoreOrder): Promise<string> {
  const ctx = await buildQuote(
    { items: o.items, couponCode: o.couponCode, pincode: o.address.pincode },
    { userId: o.userId ?? undefined, db: c, lock: true, deliveryRequired: true },
  );
  if (!ctx.quote.ok) {
    throw new OrderRejected("Some items in your basket need attention.", quoteMessages(ctx.quote));
  }
  const slot = o.slot ? await o.slot(c) : null;

  const prepaid = PREPAID_METHODS.includes(o.paymentMethod);
  const firstStatus = prepaid ? "pending_payment" : o.needsConfirmation ? "pending_confirmation" : "placed";
  const hold = o.needsConfirmation && !prepaid
    ? (o.userId ? CONFIRM_HOLD_MINUTES : GUEST_CONFIRM_HOLD_MINUTES)
    : o.holdMinutes !== undefined && o.paymentMethod !== "cod" ? o.holdMinutes : holdMinutesFor(o.paymentMethod);
  const { rows: orows } = await c.query<{ id: string }>(
    `insert into orders (user_id, status, payment_method, payment_status, subtotal, discount, coupon_id, coupon_code,
                         delivery_fee, total, delivery_date, slot_id, slot_label, address, customer_note, idempotency_key,
                         reservation_expires_at, request_fingerprint, channel, whatsapp_updates, unavailable_item_preference)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
             case when $17::int is not null then now() + make_interval(mins => $17::int) end, $18, $19, $20, $21)
     returning id`,
    [
      o.userId, firstStatus, o.paymentMethod, prepaid ? "pending" : "cod_pending",
      ctx.quote.subtotal, ctx.quote.discount, ctx.couponId, ctx.quote.couponCode, ctx.quote.deliveryFee, ctx.quote.total,
      o.deliveryDate, slot?.id ?? null, slot?.label ?? NO_SLOT_LABEL,
      JSON.stringify(o.address), o.customerNote ?? null, o.idempotencyKey,
      prepaid || firstStatus === "pending_confirmation" ? hold : null, o.fingerprint, o.channel, o.whatsappUpdates,
      o.unavailableItems,
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
    await c.query("insert into coupon_redemptions (coupon_id, order_id, user_id) values ($1,$2,$3)", [ctx.couponId, id, o.userId]);
    await c.query("update coupons set used_count = used_count + 1 where id = $1", [ctx.couponId]);
  }

  if (o.userId) {
    // Fill the customer's profile name / mobile from their first order if they haven't set them yet.
    await c.query(
      "update profiles set full_name = coalesce(nullif(trim(full_name), ''), $2), phone = coalesce(nullif(trim(phone), ''), $3) where id = $1",
      [o.userId, o.address.fullName, o.address.phone],
    );
  }

  const holdText = hold === null ? "" : hold >= 120 ? ` (stock held for ${Math.round(hold / 60)} hours)` : ` (stock held for ${hold} minutes)`;
  const note = !prepaid
    ? o.needsConfirmation
      ? "Order saved via WhatsApp — pay on delivery. Waiting for the store to confirm it."
      : `Order placed${o.channel === "whatsapp" ? " via WhatsApp" : ""} — pay on delivery`
    : o.paymentMethod === "upi"
      ? `Waiting for UPI payment — staff confirm it in the bank statement${holdText}`
      : `Waiting for payment${holdText}`;
  await c.query("insert into order_events (order_id, status, note, actor) values ($1,$2,$3,'customer')", [id, firstStatus, note]);
  return id;
}

const isIdempotencyConflict = (e: unknown) =>
  (e as { code?: string }).code === "23505" && String((e as { constraint?: string }).constraint).includes("idempotency");

/**
 * Creates an order with server-computed totals and reserves stock atomically.
 * - Variant + coupon rows are locked FOR UPDATE; stock is decremented with a guarded UPDATE
 *   (and a CHECK constraint), so concurrent checkouts cannot oversell.
 * - The slot row is locked so slot capacity is enforced.
 * - (user_id, idempotency_key) is unique, so retries return the original order.
 */
/**
 * A retry (same idempotency key, or an identical resubmit) that matches an order which has since been
 * cancelled — e.g. starting the online payment failed — must not look like a successful order (the
 * client would clear the basket). It gets an explicit ORDER_CANCELLED conflict instead; the client
 * keeps the basket and makes a new idempotency key for the customer's next deliberate attempt.
 */
function rejectIfCancelled(r: { order: Order; created: boolean }) {
  if (!r.created && r.order.status === "cancelled") {
    throw new HttpError(409, `Order ${r.order.orderNumber} was cancelled. Your basket is unchanged — please place the order again.`, "ORDER_CANCELLED", {
      orderId: r.order.id,
      orderNumber: r.order.orderNumber,
    });
  }
  return r;
}

export async function placeOrder(userId: string, input: PlaceOrderInput): Promise<{ order: Order; created: boolean }> {
  return rejectIfCancelled(await placeOrderOnce(userId, input));
}

async function placeOrderOnce(userId: string, input: PlaceOrderInput): Promise<{ order: Order; created: boolean }> {
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
  const fingerprint = orderFingerprint({
    items: [...input.items].map((i) => [i.variantId, i.quantity]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    addressId: input.addressId ?? null,
    address: input.address
      ? [input.address.fullName, input.address.phone, input.address.line1, input.address.line2 ?? "", input.address.pincode].map((x) => String(x).trim().toLowerCase())
      : null,
    slot: input.slotId,
    date: input.deliveryDate,
    pay: input.paymentMethod,
    coupon: (input.couponCode ?? "").trim().toUpperCase(),
  });

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

      const id = await insertOrder(c, {
        userId, address, items: input.items, couponCode: input.couponCode, paymentMethod: input.paymentMethod, channel: "web",
        deliveryDate: input.deliveryDate, customerNote: input.customerNote, unavailableItems: input.unavailableItems ?? "call",
        idempotencyKey: input.idempotencyKey, fingerprint,
        whatsappUpdates: Boolean(input.whatsappUpdates),
        slot: async (cc) => {
          const slot = await lockAndCheckSlot(cc, input.slotId, input.deliveryDate);
          if (!slot.ok) throw new OrderRejected(slot.reason, { _slot: slot.reason });
          return { id: input.slotId, label: `${slot.rule.label}, ${slot.rule.startTime}–${slot.rule.endTime}` };
        },
      });
      return { id, created: true };
    });
    const order = (await getOrderById(result.id))!;
    if (result.created && order.status === "placed") scheduleOrderNotification(order.id, "confirmed"); // COD: confirmed right away
    return { order, created: result.created };
  } catch (e) {
    // Concurrent retry with the same idempotency key.
    if (isIdempotencyConflict(e)) {
      const again = await query<{ id: string }>("select id from orders where user_id = $1 and idempotency_key = $2", [userId, input.idempotencyKey]);
      if (again[0]) return { order: (await getOrderById(again[0].id))!, created: false };
    }
    throw e;
  }
}

/**
 * "Order on WhatsApp": saves the order in the database first (server-side totals, stock reserved,
 * idempotent), so the WhatsApp message carries a real order ID and exact amounts. Works signed in
 * (the order appears in the account) or as a guest (tracked by a secret link).
 * Coupons need an account (per-customer limits can't be checked for guests).
 */
export async function placeWhatsAppOrder(userId: string | null, input: WhatsAppOrderInput): Promise<{ order: Order; created: boolean }> {
  return rejectIfCancelled(await placeWhatsAppOrderOnce(userId, input));
}

async function placeWhatsAppOrderOnce(userId: string | null, input: WhatsAppOrderInput): Promise<{ order: Order; created: boolean }> {
  const settings = await getSettings();
  if (!whatsappPaymentMethods(settings).includes(input.paymentMethod)) {
    throw badRequest("That payment method isn't available right now.");
  }
  if (!userId && input.couponCode) throw badRequest("Sign in to use a coupon, or remove it to order as a guest.");
  const today = istDateString(new Date());
  const slotId = input.slotId ?? null;
  const deliveryDate = input.deliveryDate ?? today;
  if (slotId && (deliveryDate < today || deliveryDate > addDays(today, settings.slotDaysAhead - 1))) {
    throw new OrderRejected("That delivery date is no longer available. Please choose a date and time again.", { _slot: "Choose a delivery date and time again." });
  }
  await releaseExpired();

  const cu = input.customer;
  const address: AddressSnapshot = {
    label: "WhatsApp", fullName: cu.name, phone: cu.phone, line1: cu.address, line2: cu.area || null, landmark: null,
    city: cu.city, state: "", pincode: cu.pincode,
  };
  const fingerprint = orderFingerprint({
    items: [...input.items].map((i) => [i.variantId, i.quantity]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    phone: cu.phone,
    address: [cu.address, cu.area, cu.pincode].map((x) => String(x ?? "").trim().toLowerCase()),
    pay: input.paymentMethod,
    coupon: (input.couponCode ?? "").trim().toUpperCase(),
    slot: slotId,
    date: slotId ? deliveryDate : null,
  });
  const owner = userId ?? `guest:${cu.phone}`;
  const findSame = (c: Q) =>
    c.query<{ id: string }>(
      `select id from orders
        where (case when $1::uuid is null then user_id is null and address->>'phone' = $4 else user_id = $1::uuid end)
          and (idempotency_key = $2
               or (request_fingerprint = $3 and created_at > now() - interval '2 minutes' and status <> 'cancelled'))
        order by created_at desc limit 1`,
      [userId, input.idempotencyKey, fingerprint, cu.phone],
    );

  try {
    const result = await tx(async (c): Promise<{ id: string; created: boolean }> => {
      // Serialise placements per customer (or per mobile number for guests).
      await c.query("select pg_advisory_xact_lock(hashtext('place_order:' || $1))", [owner]);
      const dup = await findSame(c);
      if (dup.rows[0]) return { id: dup.rows[0].id, created: false };
      if (!userId) {
        // Unpaid or not-yet-confirmed guest orders hold stock; cap them per mobile number.
        const open = await c.query<{ n: number }>(
          `select count(*)::int as n from orders
            where user_id is null and status in ('pending_payment', 'pending_confirmation') and address->>'phone' = $1`,
          [cu.phone],
        );
        if ((open.rows[0]?.n ?? 0) >= GUEST_OPEN_LIMIT) {
          throw conflict("You already have orders waiting for payment or confirmation. Please send them on WhatsApp or wait for the store to confirm, or sign in to order.");
        }
        const shop = await c.query<{ n: number }>(
          "select count(*)::int as n from orders where user_id is null and status = 'pending_confirmation'",
        );
        if ((shop.rows[0]?.n ?? 0) >= GUEST_UNCONFIRMED_SHOP_LIMIT) {
          throw new HttpError(503, "We're getting a lot of orders right now. Please sign in to order, or try again in a little while.", "BUSY");
        }
      }
      const id = await insertOrder(c, {
        userId, address, items: input.items, couponCode: userId ? input.couponCode : null, paymentMethod: input.paymentMethod,
        channel: "whatsapp", deliveryDate, customerNote: cu.notes || null, unavailableItems: input.unavailableItems ?? "call",
        idempotencyKey: input.idempotencyKey, fingerprint, whatsappUpdates: Boolean(input.whatsappUpdates),
        // Cash on delivery: the store confirms it after the customer's WhatsApp message arrives.
        needsConfirmation: true,
        // Slot capacity is shared with website orders; without a slot the time is agreed on WhatsApp.
        slot: slotId
          ? async (cc) => {
              const slot = await lockAndCheckSlot(cc, slotId, deliveryDate);
              if (!slot.ok) throw new OrderRejected(slot.reason, { _slot: slot.reason });
              return { id: slotId, label: `${slot.rule.label}, ${slot.rule.startTime}–${slot.rule.endTime}` };
            }
          : null,
        holdMinutes: userId ? undefined : GUEST_PAYMENT_HOLD_MINUTES,
      });
      return { id, created: true };
    });
    const order = (await getOrderById(result.id))!;
    // WhatsApp COD orders wait in "pending_confirmation"; the "confirmed" update is sent when staff confirm.
    if (result.created && order.status === "placed") scheduleOrderNotification(order.id, "confirmed"); // COD: confirmed right away
    return { order, created: result.created };
  } catch (e) {
    if (isIdempotencyConflict(e)) {
      const again = await findSame(pool);
      if (again.rows[0]) return { order: (await getOrderById(again.rows[0].id))!, created: false };
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* Cancel / reorder                                                    */
/* ------------------------------------------------------------------ */

export async function cancelOrder(orderId: string, actor: string, reason: string) {
  await tx(async (c) => {
    await c.query("select cancel_order($1, $2, $3)", [orderId, actor, reason]);
  });
  cancelPaymentLinkFor(orderId);
}

/**
 * Customer cancellation. Ownership and the "not packed yet" rule are checked under the order's row lock
 * in the same transaction as the cancellation, so staff packing it a moment earlier (or dispatching it)
 * can't be overridden. Staff cancellations keep their wider rules (adminUpdateOrderStatus).
 */
export async function customerCancel(userId: string, orderId: string) {
  await tx(async (c) => {
    const { rows } = await c.query<{ status: OrderStatus }>(
      "select status from orders where id = $1 and user_id = $2 for update",
      [orderId, userId],
    );
    const o = rows[0];
    if (!o) throw notFound("Order not found.");
    if (!canCustomerCancel(o.status)) throw conflict("This order can no longer be cancelled. Please contact support.");
    await c.query("select cancel_order($1, $2, $3)", [orderId, "customer", "Cancelled by customer"]);
  });
  cancelPaymentLinkFor(orderId);
  return getMyOrder(userId, orderId);
}

/**
 * "Buy again": the items of a past order, re-checked NOW — today's price, the product, its category and
 * the pack size must still be on sale, and quantities are capped to today's stock (weight products:
 * every pack size from the order shares the product's one total). Unavailable items and price changes
 * are reported so the customer sees them; nothing is added at an old price.
 */
export async function reorderItems(userId: string, orderId: string) {
  const order = await getMyOrder(userId, orderId);
  if (!order) throw notFound("Order not found.");
  const ids = order.items.map((i) => i.variantId).filter((x): x is string => Boolean(x));
  const rows = await query<{
    id: string; stock: number; active: boolean; slug: string; price: number; label: string; product_id: string;
    product_name: string; stock_grams: number | null; grams: number | null; image_url: string | null;
  }>(
    `select v.id, v.stock, (v.active and p.active and c.active) as active, p.slug, v.price, v.label, p.id as product_id,
            p.name as product_name, p.stock_grams::float8 as stock_grams, pack_label_grams(v.label) as grams,
            (select url from product_images i where i.product_id = p.id order by sort_order limit 1) as image_url
       from product_variants v join products p on p.id = v.product_id join categories c on c.id = p.category_id
      where v.id = any($1::uuid[])`,
    [ids],
  );
  const avail = new Map(rows.map((r) => [r.id, r]));
  const gramsLeft = new Map<string, number>();
  const items: {
    variantId: string; productSlug: string; productName: string; variantLabel: string; imageUrl: string | null;
    quantity: number; requested: number; price: number; oldPrice: number;
  }[] = [];
  const skipped: { productName: string; variantLabel: string; reason: "unavailable" | "out_of_stock" }[] = [];
  for (const it of order.items) {
    const v = it.variantId ? avail.get(it.variantId) : undefined;
    if (!v || !v.active) {
      skipped.push({ productName: it.productName, variantLabel: it.variantLabel, reason: "unavailable" });
      continue;
    }
    let canHave = v.stock;
    if (v.stock_grams !== null && v.grams) {
      const left = gramsLeft.get(v.product_id) ?? v.stock_grams;
      canHave = Math.floor(left / v.grams);
    }
    const qty = Math.min(it.quantity, canHave, MAX_QTY_PER_LINE);
    if (qty <= 0) {
      skipped.push({ productName: it.productName, variantLabel: it.variantLabel, reason: "out_of_stock" });
      continue;
    }
    if (v.stock_grams !== null && v.grams) gramsLeft.set(v.product_id, (gramsLeft.get(v.product_id) ?? v.stock_grams) - qty * v.grams);
    items.push({
      variantId: v.id, productSlug: v.slug, productName: v.product_name, variantLabel: v.label, imageUrl: v.image_url,
      quantity: qty, requested: it.quantity, price: v.price, oldPrice: it.unitPrice,
    });
  }
  return { items, skipped };
}

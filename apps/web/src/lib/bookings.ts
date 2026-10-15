import "server-only";
import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import {
  addDays, BOOKING_STATUS_LABEL, buildBookingWhatsAppUrl, buildUpiLink, canMoveBooking, createBookingSchema,
  formatBookingDate, istDateString, UPI_ID_REGEX,
  type BookingPaymentMethod, type BookingPaymentStatus, type BookingStatus,
} from "@freshbasket/shared";
import type { z } from "zod";
import { pool, query, queryOne, tx } from "./db";
import { CACHE_TAGS, invalidate } from "./cache";
import { env } from "./env";
import { badRequest, conflict, HttpError, notFound } from "./http";
import { buildQuote, quoteMessages } from "./quote";
import { lockAndCheckSlot } from "./delivery";
import { getSettings } from "./settings";
import { resolveWhatsAppNumber, storeConfig } from "@/config/store";
import { createPaymentLink } from "./payments/razorpay";

type Q = Pick<PoolClient, "query">;
export type CreateBookingData = z.output<typeof createBookingSchema>;

export class BookingRejected extends HttpError {
  constructor(message: string, public messages: Record<string, string>) {
    super(409, message, "BOOKING_REJECTED", { messages });
  }
}

export interface Booking {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  statusLabel: string;
  paymentMethod: BookingPaymentMethod;
  paymentStatus: BookingPaymentStatus;
  customerName: string;
  customerPhone: string;
  addressLine: string;
  area: string | null;
  city: string;
  pincode: string;
  deliveryNotes: string | null;
  deliveryDate: string;
  slotLabel: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  stockTaken: boolean;
  paymentLinkUrl: string | null;
  paymentReference: string | null;
  paidAt: string | null;
  cancelledReason: string | null;
  confirmedAt: string | null;
  createdAt: string;
  items: { variantId: string | null; productName: string; variantLabel: string; unitPrice: number; quantity: number; lineTotal: number; imageUrl: string | null }[];
  events: { status: string; note: string | null; actor: string; createdAt: string }[];
}

type Row = {
  id: string; booking_number: string; status: BookingStatus; payment_method: BookingPaymentMethod; payment_status: BookingPaymentStatus;
  customer_name: string; customer_phone: string; address_line: string; area: string | null; city: string; pincode: string;
  delivery_notes: string | null; delivery_date: string; slot_label: string; subtotal: number; discount: number; delivery_fee: number;
  total: number; stock_taken: boolean; razorpay_link_url: string | null; payment_reference: string | null; paid_at: Date | null;
  cancelled_reason: string | null; confirmed_at: Date | null; created_at: Date;
};

const COLS = `b.id, b.booking_number, b.status, b.payment_method, b.payment_status, b.customer_name, b.customer_phone, b.address_line,
  b.area, b.city, b.pincode, b.delivery_notes, to_char(b.delivery_date, 'YYYY-MM-DD') as delivery_date, b.slot_label, b.subtotal,
  b.discount, b.delivery_fee, b.total, b.stock_taken, b.razorpay_link_url, b.payment_reference, b.paid_at, b.cancelled_reason,
  b.confirmed_at, b.created_at`;

async function hydrate(db: Q, rows: Row[]): Promise<Booking[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [{ rows: items }, { rows: events }] = await Promise.all([
    db.query<{ booking_id: string; variant_id: string | null; product_name: string; variant_label: string; unit_price: number; quantity: number; line_total: number; image_url: string | null }>(
      "select * from whatsapp_booking_items where booking_id = any($1::uuid[]) order by product_name", [ids]),
    db.query<{ booking_id: string; status: string; note: string | null; actor: string; created_at: Date }>(
      "select booking_id, status, note, actor, created_at from whatsapp_booking_events where booking_id = any($1::uuid[]) order by created_at, id", [ids]),
  ]);
  return rows.map((r) => ({
    id: r.id, bookingNumber: r.booking_number, status: r.status, statusLabel: BOOKING_STATUS_LABEL[r.status],
    paymentMethod: r.payment_method, paymentStatus: r.payment_status, customerName: r.customer_name, customerPhone: r.customer_phone,
    addressLine: r.address_line, area: r.area, city: r.city, pincode: r.pincode, deliveryNotes: r.delivery_notes,
    deliveryDate: r.delivery_date, slotLabel: r.slot_label, subtotal: r.subtotal, discount: r.discount, deliveryFee: r.delivery_fee,
    total: r.total, stockTaken: r.stock_taken, paymentLinkUrl: r.razorpay_link_url, paymentReference: r.payment_reference,
    paidAt: r.paid_at?.toISOString() ?? null, cancelledReason: r.cancelled_reason, confirmedAt: r.confirmed_at?.toISOString() ?? null,
    createdAt: r.created_at.toISOString(),
    items: items.filter((i) => i.booking_id === r.id).map((i) => ({
      variantId: i.variant_id, productName: i.product_name, variantLabel: i.variant_label, unitPrice: i.unit_price,
      quantity: i.quantity, lineTotal: i.line_total, imageUrl: i.image_url,
    })),
    events: events.filter((e) => e.booking_id === r.id).map((e) => ({ status: e.status, note: e.note, actor: e.actor, createdAt: e.created_at.toISOString() })),
  }));
}

export async function getBooking(id: string, db: Q = pool): Promise<Booking | null> {
  const { rows } = await db.query<Row>(`select ${COLS} from whatsapp_bookings b where b.id = $1`, [id]);
  return (await hydrate(db, rows))[0] ?? null;
}

/** Payment methods a WhatsApp booking can use right now (only ones that are actually set up). */
export function bookingPaymentMethods(s: { codEnabled: boolean; upiId: string | null }): BookingPaymentMethod[] {
  const out: BookingPaymentMethod[] = [];
  if (s.upiId && UPI_ID_REGEX.test(s.upiId)) out.push("upi_qr");
  if (env.payments.online === "razorpay") out.push("razorpay_link");
  if (s.codEnabled) out.push("cod");
  return out;
}

export interface BookingCreated {
  booking: Booking;
  created: boolean;
  whatsappUrl: string;
  upiLink: string | null;
}

/**
 * Saves a WhatsApp booking with server-computed totals, BEFORE WhatsApp is opened.
 * - Prices, delivery fee and totals come from the database (buildQuote); the client sends only variant IDs + quantities.
 * - The booking number is generated by the database.
 * - (idempotency_key) is unique, and an identical request (same phone, items, date, slot, payment) within
 *   10 minutes returns the first booking, so double taps and retries never create duplicates.
 * - Stock is checked now but only taken when the shop confirms the booking.
 */
export async function createBooking(input: CreateBookingData, opts: { userId?: string | null } = {}): Promise<BookingCreated> {
  if (input.website) throw badRequest("Could not save the booking. Please try again.");
  const settings = await getSettings();
  const whatsapp = resolveWhatsAppNumber(settings.whatsapp);
  if (!whatsapp) throw badRequest("WhatsApp booking isn't set up yet. Please use Proceed to Checkout instead.");
  if (!bookingPaymentMethods(settings).includes(input.paymentMethod)) throw badRequest("That payment method isn't available right now.");

  const today = istDateString(new Date());
  const lastDay = addDays(today, settings.slotDaysAhead - 1);
  if (input.deliveryDate < today || input.deliveryDate > lastDay) throw badRequest("Please choose one of the delivery dates shown.");

  const c = input.customer;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({
      phone: c.phone,
      items: [...input.items].map((i) => [i.variantId, i.quantity]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      date: input.deliveryDate, slot: input.slotId, pay: input.paymentMethod, pin: c.pincode,
      addr: c.address.trim().toLowerCase(),
    }))
    .digest("hex");

  const result = await tx(async (db): Promise<{ id: string; created: boolean }> => {
    // One booking at a time per mobile number, so two simultaneous taps can't both pass the duplicate check.
    await db.query("select pg_advisory_xact_lock(hashtext('wa_booking:' || $1))", [c.phone]);
    const dup = await db.query<{ id: string }>(
      `select id from whatsapp_bookings
        where idempotency_key = $1 or (request_fingerprint = $2 and created_at > now() - interval '10 minutes' and status <> 'cancelled')
        order by created_at desc limit 1`,
      [input.idempotencyKey, fingerprint],
    );
    if (dup.rows[0]) return { id: dup.rows[0].id, created: false };

    const slot = await lockAndCheckSlot(db, input.slotId, input.deliveryDate);
    if (!slot.ok) throw new BookingRejected(slot.reason, { _slot: slot.reason });

    const ctx = await buildQuote({ items: input.items, pincode: c.pincode }, { db, deliveryRequired: true });
    if (!ctx.quote.ok) {
      const issue = ctx.quote.issues.find((i) => i.code !== "COUPON_INVALID");
      if (issue) {
        const msg = issue.code === "AREA_NOT_SERVICEABLE"
          ? "Sorry, we don't deliver to this PIN code yet."
          : issue.code === "BELOW_MIN_ORDER" ? "Your basket is below the minimum order for this area."
          : "Some items in your basket need attention.";
        throw new BookingRejected(msg, quoteMessages(ctx.quote));
      }
    }
    const q = ctx.quote;
    const slotLabel = `${slot.rule.label}, ${slot.rule.startTime}–${slot.rule.endTime}`;

    const { rows } = await db.query<{ id: string }>(
      `insert into whatsapp_bookings (user_id, idempotency_key, request_fingerprint, payment_method, customer_name, customer_phone,
          address_line, area, city, pincode, delivery_notes, delivery_date, slot_id, slot_label, subtotal, discount, delivery_fee, total)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,$16,$17) returning id`,
      [opts.userId ?? null, input.idempotencyKey, fingerprint, input.paymentMethod, c.name, c.phone, c.address, c.area || null,
        c.city, c.pincode, c.notes || null, input.deliveryDate, input.slotId, slotLabel, q.subtotal, q.deliveryFee, q.subtotal + q.deliveryFee],
    );
    const id = rows[0]!.id;
    for (const l of q.lines) {
      const meta = ctx.variants.get(l.variantId);
      await db.query(
        `insert into whatsapp_booking_items (booking_id, variant_id, product_id, product_name, variant_label, unit_price, quantity, line_total, image_url)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, l.variantId, meta?.productId ?? null, l.productName, l.variantLabel, l.unitPrice, l.quantity, l.unitPrice * l.quantity, meta?.imageUrl ?? null],
      );
    }
    await db.query("insert into whatsapp_booking_events (booking_id, status, note, actor) values ($1, 'pending_confirmation', $2, 'customer')",
      [id, "Booking saved. WhatsApp opened for the customer — waiting for the shop to confirm."]);
    return { id, created: true };
  });

  let booking = (await getBooking(result.id))!;
  // Razorpay payment link (server-side, with our booking number as reference). If Razorpay is down the
  // booking still stands; staff can create the link later from Admin.
  if (result.created && booking.paymentMethod === "razorpay_link" && !booking.paymentLinkUrl) {
    try {
      booking = await attachPaymentLink(booking);
    } catch (e) {
      console.error("[booking] payment link failed", booking.bookingNumber, e);
    }
  }
  return {
    booking,
    created: result.created,
    whatsappUrl: bookingWhatsAppUrl(whatsapp, booking, settings),
    upiLink: booking.paymentMethod === "upi_qr" && settings.upiId
      ? buildUpiLink({ upiId: settings.upiId, payeeName: settings.upiPayeeName || settings.storeName, amount: booking.total, note: booking.bookingNumber })
      : null,
  };
}

function bookingWhatsAppUrl(number: string, b: Booking, s: { storeName: string; upiId: string | null }): string {
  return buildBookingWhatsAppUrl(number, {
    storeName: s.storeName, bookingNumber: b.bookingNumber, customerName: b.customerName, customerPhone: b.customerPhone,
    address: b.addressLine, area: b.area, city: b.city, pincode: b.pincode, notes: b.deliveryNotes,
    deliveryDateLabel: formatBookingDate(b.deliveryDate), slotLabel: b.slotLabel,
    lines: b.items.map((i) => ({ productName: i.productName, variantLabel: i.variantLabel, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal })),
    subtotal: b.subtotal, discount: b.discount, deliveryFee: b.deliveryFee, total: b.total,
    paymentMethod: b.paymentMethod, paymentLinkUrl: b.paymentLinkUrl, upiId: s.upiId,
  });
}

async function attachPaymentLink(b: Booking): Promise<Booking> {
  const link = await createPaymentLink({
    amount: b.total,
    referenceId: b.bookingNumber,
    description: `Booking ${b.bookingNumber}`,
    customer: { name: b.customerName, contact: `+91${b.customerPhone}` },
    bookingId: b.id,
    callbackUrl: `${storeConfig.siteUrl}/`,
  });
  await query("update whatsapp_bookings set razorpay_link_id = $2, razorpay_link_url = $3, updated_at = now() where id = $1", [b.id, link.id, link.short_url]);
  return (await getBooking(b.id))!;
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export async function adminListBookings(f: { status?: string; q?: string }) {
  const where: string[] = [];
  const p: unknown[] = [];
  if (f.status) { p.push(f.status); where.push(`b.status = $${p.length}`); }
  if (f.q) {
    p.push(`%${f.q.replace(/[%_\\]/g, "\\$&")}%`);
    where.push(`(b.booking_number ilike $${p.length} or b.customer_name ilike $${p.length} or b.customer_phone ilike $${p.length})`);
  }
  return query(
    `select b.id, b.booking_number as "bookingNumber", b.status, b.payment_method as "paymentMethod", b.payment_status as "paymentStatus",
            b.customer_name as "customerName", b.customer_phone as "customerPhone", b.pincode, b.total,
            to_char(b.delivery_date, 'YYYY-MM-DD') as "deliveryDate", b.slot_label as "slotLabel", b.created_at as "createdAt",
            (select count(*)::int from whatsapp_booking_items i where i.booking_id = b.id) as "itemCount"
       from whatsapp_bookings b ${where.length ? `where ${where.join(" and ")}` : ""}
      order by (b.status = 'pending_confirmation') desc, b.created_at desc limit 200`,
    p,
  );
}

export async function adminCountPendingBookings(): Promise<number> {
  return (await queryOne<{ n: number }>("select count(*)::int as n from whatsapp_bookings where status = 'pending_confirmation'"))?.n ?? 0;
}

export async function adminGetBooking(id: string) {
  const b = await getBooking(id);
  if (!b) throw notFound("Booking not found.");
  return b;
}

/**
 * Status change by staff. Confirming takes the stock (fails cleanly if something ran out);
 * cancelling returns it. Only the allowed transitions are accepted.
 */
export async function adminUpdateBookingStatus(id: string, to: BookingStatus, actorId: string, note?: string): Promise<Booking> {
  await tx(async (db) => {
    const { rows } = await db.query<{ status: BookingStatus; stock_taken: boolean; payment_status: BookingPaymentStatus }>(
      "select status, stock_taken, payment_status from whatsapp_bookings where id = $1 for update", [id]);
    const b = rows[0];
    if (!b) throw notFound("Booking not found.");
    if (b.status === to) return;
    if (!canMoveBooking(b.status, to)) {
      throw conflict(`A ${BOOKING_STATUS_LABEL[b.status]} booking can't be moved to ${BOOKING_STATUS_LABEL[to]}.`);
    }
    let stockTaken = b.stock_taken;
    if (to === "confirmed" && !stockTaken) {
      const { rows: items } = await db.query<{ variant_id: string | null; quantity: number; variant_label: string; product_name: string }>(
        "select variant_id, quantity, variant_label, product_name from whatsapp_booking_items where booking_id = $1 order by variant_id", [id]);
      // Lock products first (same order as checkout) so this can't deadlock with a checkout.
      await db.query(
        "select id from products where id in (select product_id from product_variants where id = any($1::uuid[])) order by id for update",
        [items.map((i) => i.variant_id).filter(Boolean)],
      );
      for (const it of items) {
        if (!it.variant_id) throw conflict(`${it.product_name} is no longer sold. Cancel this booking or ask the customer to re-order.`);
        const r = await db.query<{ ok: boolean }>("select take_stock($1, $2, false, $3) as ok", [it.variant_id, it.quantity, it.variant_label]);
        if (!r.rows[0]?.ok) throw conflict(`Not enough stock for ${it.product_name} (${it.variant_label}). Update stock in Inventory or cancel the booking.`);
      }
      stockTaken = true;
    }
    if (to === "cancelled" && stockTaken) {
      const { rows: items } = await db.query<{ variant_id: string | null; quantity: number; variant_label: string }>(
        "select variant_id, quantity, variant_label from whatsapp_booking_items where booking_id = $1 and variant_id is not null order by variant_id", [id]);
      for (const it of items) await db.query("select return_stock($1, $2, $3)", [it.variant_id, it.quantity, it.variant_label]);
      stockTaken = false;
    }
    await db.query(
      `update whatsapp_bookings set status = $2, stock_taken = $3, updated_at = now(),
              confirmed_at = case when $2 = 'confirmed' then now() else confirmed_at end,
              cancelled_reason = case when $2 = 'cancelled' then $4 else cancelled_reason end
        where id = $1`,
      [id, to, stockTaken, note || null],
    );
    await db.query("insert into whatsapp_booking_events (booking_id, status, note, actor) values ($1,$2,$3,$4)", [id, to, note || null, `staff:${actorId}`]);
  });
  invalidate(CACHE_TAGS.catalog);
  return adminGetBooking(id);
}

/**
 * Staff records a payment they have verified themselves: a UPI transfer (with its UTR from the shop's UPI app)
 * or cash collected. Razorpay payment-link bookings can only be marked paid by the signed Razorpay webhook.
 */
export async function adminMarkBookingPaid(id: string, reference: string, actorId: string): Promise<Booking> {
  await tx(async (db) => {
    const { rows } = await db.query<{ payment_method: BookingPaymentMethod; payment_status: BookingPaymentStatus; status: BookingStatus }>(
      "select payment_method, payment_status, status from whatsapp_bookings where id = $1 for update", [id]);
    const b = rows[0];
    if (!b) throw notFound("Booking not found.");
    if (b.payment_status === "paid") return;
    if (b.status === "cancelled") throw conflict("This booking is cancelled.");
    if (b.payment_method === "razorpay_link") throw conflict("Razorpay link payments are marked paid automatically when Razorpay confirms them.");
    if (b.payment_method === "cod" && b.status !== "delivered" && b.status !== "out_for_delivery") {
      throw conflict("Record cash only when the order is out for delivery or delivered.");
    }
    await db.query(
      "update whatsapp_bookings set payment_status = 'paid', payment_reference = $2, paid_at = now(), paid_by = $3, updated_at = now() where id = $1",
      [id, reference, actorId],
    );
    await db.query("insert into whatsapp_booking_events (booking_id, status, note, actor) values ($1, 'payment', $2, $3)",
      [id, `${b.payment_method === "cod" ? "Cash received" : "UPI payment verified"} — ref ${reference}`, `staff:${actorId}`]);
  });
  return adminGetBooking(id);
}

export async function adminCreateBookingPaymentLink(id: string): Promise<Booking> {
  const b = await adminGetBooking(id);
  if (b.paymentMethod !== "razorpay_link") throw badRequest("This booking doesn't use a Razorpay payment link.");
  if (b.status === "cancelled" || b.paymentStatus === "paid") throw conflict("No payment link needed for this booking.");
  if (env.payments.online !== "razorpay") throw badRequest("Razorpay isn't configured.");
  if (b.paymentLinkUrl) return b;
  return attachPaymentLink(b);
}

/**
 * Razorpay "payment_link.paid" webhook (signature already verified by the caller). Marks the booking paid
 * only when the link belongs to a booking and the paid amount equals the booking total.
 */
export async function processBookingPaymentLinkPaid(ev: { eventId: string; linkId: string; paymentId: string | null; amountPaid: number; payload: unknown }) {
  return tx(async (db) => {
    const ins = await db.query(
      "insert into payment_events (provider, event_id, event_type, payload) values ('razorpay', $1, 'payment_link.paid', $2) on conflict (provider, event_id) do nothing returning id",
      [ev.eventId, JSON.stringify(ev.payload)],
    );
    if (ins.rowCount === 0) return "duplicate" as const;
    const eventRowId = ins.rows[0].id as number;
    const finish = async (result: string) => {
      await db.query("update payment_events set result = $2 where id = $1", [eventRowId, result]);
      return result;
    };
    const { rows } = await db.query<{ id: string; total: number; payment_status: BookingPaymentStatus }>(
      "select id, total, payment_status from whatsapp_bookings where razorpay_link_id = $1 for update", [ev.linkId]);
    const b = rows[0];
    if (!b) return finish("booking_not_found");
    if (b.payment_status === "paid") return finish("already_processed");
    if (ev.amountPaid !== b.total) {
      await db.query("insert into whatsapp_booking_events (booking_id, status, note, actor) values ($1, 'payment', $2, 'razorpay')",
        [b.id, `Payment amount mismatch: received ${ev.amountPaid} paise, expected ${b.total}. Not marked paid.`]);
      return finish("amount_mismatch");
    }
    await db.query(
      "update whatsapp_bookings set payment_status = 'paid', payment_reference = $2, paid_at = now(), updated_at = now() where id = $1",
      [b.id, ev.paymentId ?? ev.linkId],
    );
    await db.query("insert into whatsapp_booking_events (booking_id, status, note, actor) values ($1, 'payment', $2, 'razorpay')",
      [b.id, `Paid online via Razorpay payment link (${ev.paymentId ?? ev.linkId}).`]);
    return finish("paid");
  });
}

/**
 * WhatsApp bookings against a real Postgres with the production migrations:
 * server-side prices, server booking number, idempotency/duplicates, slot capacity,
 * status workflow (stock taken on confirm, returned on cancel) and payment rules.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { addDays, createBookingSchema, istDateString, type CreateBookingInput } from "@freshbasket/shared";
import { pool, query, queryOne } from "@/lib/db";
import {
  adminCountPendingBookings, adminGetBooking, adminListBookings, adminMarkBookingPaid, adminUpdateBookingStatus,
  bookingPaymentMethods, createBooking, processBookingPaymentLinkPaid,
} from "@/lib/bookings";
import { getSlotOptions } from "@/lib/delivery";

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const tomorrow = addDays(istDateString(new Date()), 1);
const v: Record<string, string> = {};
let slot = "";
let n = 0;

function input(o: Partial<CreateBookingInput> = {}) {
  return createBookingSchema.parse({
    customer: {
      name: "Lakhan Singh", phone: "9876543210", address: `House ${++n}, 4th Cross, near park`, area: "Koramangala",
      city: "Bengaluru", pincode: "560034", notes: "Call before coming",
    },
    items: [{ variantId: v["tomato:500 g"]!, quantity: 4 }],
    deliveryDate: tomorrow, slotId: slot, paymentMethod: "cod", idempotencyKey: randomUUID(), ...o,
  } satisfies CreateBookingInput);
}

const stock = async (id: string) => (await queryOne<{ stock: number }>("select stock from product_variants where id = $1", [id]))!.stock;

beforeAll(async () => {
  const rows = await query<{ id: string; slug: string; label: string }>(
    "select v.id, p.slug, v.label from product_variants v join products p on p.id = v.product_id");
  for (const r of rows) v[`${r.slug}:${r.label}`] = r.id;
  slot = (await queryOne<{ id: string }>("select id from delivery_slots where label = 'Evening'"))!.id;
  await query("update delivery_slots set capacity = 1000");
  await query("update store_settings set whatsapp = '919812345678', cod_enabled = true, upi_id = 'freshbasket@okaxis', upi_payee_name = 'Ram Avatar Fresh Basket'");
});

afterAll(async () => {
  await pool.end();
});

describe("create booking", () => {
  it("saves with server prices, a server booking number and Pending Confirmation, then builds the WhatsApp link", async () => {
    const before = await stock(v["tomato:500 g"]!);
    const r = await createBooking(input());
    expect(r.created).toBe(true);
    const b = r.booking;
    expect(b.bookingNumber).toMatch(/^WB\d{6}-\d{5}$/);
    expect(b.status).toBe("pending_confirmation");
    expect(b.paymentStatus).toBe("unpaid");
    const price = (await queryOne<{ price: number }>("select price from product_variants where id = $1", [v["tomato:500 g"]!]))!.price;
    expect(b.subtotal).toBe(price * 4);
    expect(b.total).toBe(b.subtotal + b.deliveryFee);
    expect(r.whatsappUrl.startsWith("https://wa.me/919812345678?text=")).toBe(true);
    const text = decodeURIComponent(r.whatsappUrl.split("text=")[1]!);
    expect(text).toContain("Mujhe apna order book karna hai");
    expect(text).toContain(b.bookingNumber);
    expect(text).toContain("Cash on Delivery");
    // Booking alone doesn't take stock.
    expect(await stock(v["tomato:500 g"]!)).toBe(before);
  });

  it("ignores any price the client might try to send", async () => {
    const raw = { ...input(), subtotal: 1, total: 1, items: [{ variantId: v["tomato:500 g"]!, quantity: 4, unitPrice: 1 }] };
    const r = await createBooking(createBookingSchema.parse(raw));
    expect(r.booking.subtotal).toBeGreaterThan(1);
  });

  it("returns the same booking for a retried request (idempotency key)", async () => {
    const i = input();
    const a = await createBooking(i);
    const b = await createBooking(i);
    expect(b.created).toBe(false);
    expect(b.booking.id).toBe(a.booking.id);
  });

  it("returns the first booking for an identical double tap with a new key", async () => {
    const i = input();
    const a = await createBooking(i);
    const b = await createBooking({ ...i, idempotencyKey: randomUUID() });
    expect(b.booking.id).toBe(a.booking.id);
  });

  it("rejects simultaneous double submits as one booking", async () => {
    const i = input();
    const [a, b] = await Promise.all([createBooking(i), createBooking({ ...i, idempotencyKey: randomUUID() })]);
    expect(a.booking.id).toBe(b.booking.id);
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1);
  });

  it("rejects a PIN code outside the delivery areas, out-of-stock items and the honeypot", async () => {
    await expect(createBooking(input({ customer: { name: "A B", phone: "9876543210", address: "House 1, street", city: "Delhi", pincode: "110001" } }))).rejects.toThrow(/deliver/);
    await expect(createBooking(input({ items: [{ variantId: v["tomato:500 g"]!, quantity: 99 }] }))).rejects.toThrow(/attention/);
    await expect(createBooking({ ...input(), website: "spam.example" })).rejects.toThrow();
  });

  it("rejects payment methods that aren't set up and dates outside the window", async () => {
    expect(bookingPaymentMethods({ codEnabled: true, upiId: null })).toEqual(["cod"]);
    await expect(createBooking(input({ paymentMethod: "razorpay_link" }))).rejects.toThrow(/payment method/);
    await expect(createBooking(input({ deliveryDate: addDays(tomorrow, 30) }))).rejects.toThrow(/delivery dates/);
  });

  it("UPI QR bookings include an exact-amount upi:// link", async () => {
    const r = await createBooking(input({ paymentMethod: "upi_qr" }));
    expect(r.upiLink).toContain("pa=freshbasket%40okaxis");
    expect(r.upiLink).toContain(`am=${(r.booking.total / 100).toFixed(2)}`);
    expect(r.upiLink).toContain(r.booking.bookingNumber);
  });

  it("counts bookings in slot capacity", async () => {
    const tiny = (await queryOne<{ id: string }>(
      "insert into delivery_slots (label, start_time, end_time, cutoff_minutes, capacity) values ('Tiny', '20:00', '21:00', 0, 1) returning id"))!.id;
    await createBooking(input({ slotId: tiny }));
    const opt = (await getSlotOptions(3)).find((s) => s.slotId === tiny && s.date === tomorrow)!;
    expect(opt.available).toBe(false);
    await expect(createBooking(input({ slotId: tiny }))).rejects.toThrow(/full or closed/);
  });
});

describe("admin workflow", () => {
  it("confirm takes stock, cancel returns it, invalid moves are refused", async () => {
    const id = v["potato:1 kg"] ?? v["tomato:500 g"]!;
    const before = await stock(id);
    const { booking } = await createBooking(input({ items: [{ variantId: id, quantity: 2 }] }));
    expect(await adminCountPendingBookings()).toBeGreaterThan(0);
    expect((await adminListBookings({ status: "pending_confirmation" })).some((r) => r.id === booking.id)).toBe(true);

    await expect(adminUpdateBookingStatus(booking.id, "delivered", ADMIN)).rejects.toThrow(/can't be moved/);
    const c = await adminUpdateBookingStatus(booking.id, "confirmed", ADMIN);
    expect(c.status).toBe("confirmed");
    expect(c.stockTaken).toBe(true);
    expect(await stock(id)).toBe(before - 2);

    await adminUpdateBookingStatus(booking.id, "preparing", ADMIN);
    const x = await adminUpdateBookingStatus(booking.id, "cancelled", ADMIN, "Customer asked to cancel");
    expect(x.status).toBe("cancelled");
    expect(x.cancelledReason).toBe("Customer asked to cancel");
    expect(await stock(id)).toBe(before);
    expect(x.events.map((e) => e.status)).toEqual(["pending_confirmation", "confirmed", "preparing", "cancelled"]);
  });

  it("confirm fails cleanly when stock ran out", async () => {
    const id = v["tomato:500 g"]!;
    const { booking } = await createBooking(input({ items: [{ variantId: id, quantity: 4 }] }));
    const saved = await stock(id);
    await query("update products set stock_grams = 0 where id = (select product_id from product_variants where id = $1) and stock_grams is not null", [id]);
    await query("update product_variants set stock = 0 where id = $1", [id]);
    await expect(adminUpdateBookingStatus(booking.id, "confirmed", ADMIN)).rejects.toThrow(/Not enough stock/);
    expect((await adminGetBooking(booking.id)).status).toBe("pending_confirmation");
    await query("update products set stock_grams = 100000 where id = (select product_id from product_variants where id = $1) and stock_grams is not null", [id]);
    await query("update product_variants set stock = greatest(stock, $2) where id = $1", [id, saved]);
  });

  it("COD is paid only after dispatch, with a reference; UPI needs a UTR", async () => {
    const { booking } = await createBooking(input());
    await expect(adminMarkBookingPaid(booking.id, "cash note", ADMIN)).rejects.toThrow(/out for delivery/);
    await adminUpdateBookingStatus(booking.id, "confirmed", ADMIN);
    await adminUpdateBookingStatus(booking.id, "out_for_delivery", ADMIN);
    const paid = await adminMarkBookingPaid(booking.id, "Cash by Raju", ADMIN);
    expect(paid.paymentStatus).toBe("paid");
    expect(paid.paymentReference).toBe("Cash by Raju");

    const upi = (await createBooking(input({ paymentMethod: "upi_qr" }))).booking;
    const p2 = await adminMarkBookingPaid(upi.id, "428912345678", ADMIN);
    expect(p2.paymentStatus).toBe("paid");
  });

  it("Razorpay link bookings: never paid by hand; webhook pays only the exact amount, once", async () => {
    const { booking } = await createBooking(input());
    await query("update whatsapp_bookings set payment_method = 'razorpay_link', razorpay_link_id = 'plink_test1' where id = $1", [booking.id]);
    await expect(adminMarkBookingPaid(booking.id, "123456", ADMIN)).rejects.toThrow(/automatically/);
    expect(await processBookingPaymentLinkPaid({ eventId: "evt_a", linkId: "plink_test1", paymentId: "pay_1", amountPaid: booking.total - 100, payload: {} })).toBe("amount_mismatch");
    expect((await adminGetBooking(booking.id)).paymentStatus).toBe("unpaid");
    expect(await processBookingPaymentLinkPaid({ eventId: "evt_b", linkId: "plink_test1", paymentId: "pay_2", amountPaid: booking.total, payload: {} })).toBe("paid");
    expect(await processBookingPaymentLinkPaid({ eventId: "evt_b", linkId: "plink_test1", paymentId: "pay_2", amountPaid: booking.total, payload: {} })).toBe("duplicate");
    expect((await adminGetBooking(booking.id)).paymentStatus).toBe("paid");
  });

  it("clients can't read bookings directly (RLS, no grants)", async () => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local role anon");
      await expect(c.query("select * from whatsapp_bookings")).rejects.toThrow(/permission denied/);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});

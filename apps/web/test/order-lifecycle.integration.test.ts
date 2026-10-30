/**
 * Order lifecycle, end to end through the real order functions and database: booking → packing →
 * delivery → payment bookkeeping, and every way an order can be cancelled — with stock, coupon use,
 * payment status and the order history checked after each step. (31 Oct 2026, owner request:
 * "order book se le kar order cancel tak aur returns".)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { addDays, istDateString, whatsappOrderSchema, type PlaceOrderInput } from "@freshbasket/shared";
import { pool, query, queryOne } from "@/lib/db";
import { customerCancel, getOrderById, placeOrder, placeWhatsAppOrder, releaseExpired } from "@/lib/orders";
import { adminGetOrder, adminUpdateOrderStatus, adminUpdatePaymentStatus } from "@/lib/admin/orders";
import { adminConfirmUpiPayment } from "@/lib/payments/upi";

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const tomorrow = addDays(istDateString(new Date()), 1);
const v: Record<string, string> = {};
let slot = "";
const ITEM = () => v["onion:1 kg"]!;

const input = (o: Partial<PlaceOrderInput> = {}): PlaceOrderInput =>
  ({
    items: [{ variantId: ITEM(), quantity: 4 }],
    address: { label: "Home", fullName: "Life Cycle", phone: "9876543210", line1: `LC lane ${randomUUID().slice(0, 6)}`, city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false },
    saveAddress: false, slotId: slot, deliveryDate: tomorrow, paymentMethod: "cod", idempotencyKey: randomUUID(), couponCode: null, customerNote: null, ...o,
  }) as PlaceOrderInput;

/** What can still be sold of the item: the product's kilos when sold by weight, else the pack count. */
const available = async () => {
  const r = (await queryOne<{ g: string | null; s: number }>(
    "select p.stock_grams::text as g, v.stock as s from product_variants v join products p on p.id = v.product_id where v.id = $1",
    [ITEM()],
  ))!;
  return r.g !== null ? Number(r.g) : r.s;
};
const couponUses = async () => (await queryOne<{ n: number }>("select used_count as n from coupons where code = 'FRESH10'"))!.n;
const history = async (id: string) => (await query<{ status: string; actor: string }>("select status, actor from order_events where order_id = $1 order by created_at, id", [id])).map((e) => e.status);

beforeAll(async () => {
  for (const r of await query<{ id: string; slug: string; label: string }>("select v.id, p.slug, v.label from product_variants v join products p on p.id = v.product_id")) v[`${r.slug}:${r.label}`] = r.id;
  slot = (await queryOne<{ id: string }>("select id from delivery_slots where label = 'Evening'"))!.id;
  await query("update delivery_slots set capacity = 1000");
  await query("update store_settings set upi_id = 'freshbasket.test@okaxis'");
  await query("update product_variants set stock = greatest(stock, 500) where id = $1", [ITEM()]);
  await query("update products set stock_grams = greatest(stock_grams, 500000) where stock_grams is not null and id = (select product_id from product_variants where id = $1)", [ITEM()]);
});
afterAll(async () => {
  await pool.end();
});

describe("cash on delivery: booked → packed → out for delivery → delivered → cash collected", () => {
  it("each step is recorded; stock is taken once; a delivered order can't be cancelled", async () => {
    const before = await available();
    const { order } = await placeOrder(CUSTOMER, input());
    expect(order.status).toBe("placed");
    expect(order.paymentStatus).toBe("cod_pending");
    expect(await available()).toBeLessThan(before);
    const taken = before - (await available());

    for (const s of ["packed", "out_for_delivery", "delivered"] as const) expect((await adminUpdateOrderStatus(order.id, s, ADMIN)).status).toBe(s);
    expect(await available()).toBe(before - taken); // stock taken once, not per step

    await expect(customerCancel(CUSTOMER, order.id)).rejects.toMatchObject({ status: 409 });
    await expect(adminUpdateOrderStatus(order.id, "cancelled", ADMIN, "try")).rejects.toMatchObject({ status: 409 });
    expect((await adminUpdatePaymentStatus(order.id, "cod_collected", ADMIN)).paymentStatus).toBe("cod_collected");
    expect(await history(order.id)).toEqual(["placed", "packed", "out_for_delivery", "delivered", "delivered"]);
  });

  it("cash can't be recorded before delivery, and status can't jump backwards", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    await expect(adminUpdatePaymentStatus(order.id, "cod_collected", ADMIN)).rejects.toMatchObject({ status: 409 });
    await adminUpdateOrderStatus(order.id, "packed", ADMIN);
    await expect(adminUpdateOrderStatus(order.id, "placed", ADMIN)).rejects.toMatchObject({ status: 409 });
  });
});

describe("cancelling", () => {
  it("customer cancels a placed COD order: stock and coupon come back, nothing to refund", async () => {
    const stock = await available();
    const uses = await couponUses();
    const { order } = await placeOrder(CUSTOMER, input({ couponCode: "FRESH10", items: [{ variantId: ITEM(), quantity: 6 }] }));
    expect(order.discount).toBeGreaterThan(0);
    expect(await couponUses()).toBe(uses + 1);
    const o = await customerCancel(CUSTOMER, order.id);
    expect(o!.status).toBe("cancelled");
    expect(o!.paymentStatus).toBe("cod_cancelled");
    expect(await available()).toBe(stock);
    expect(await couponUses()).toBe(uses);
    // Cancelling twice changes nothing.
    await customerCancel(CUSTOMER, order.id).catch(() => undefined);
    expect(await available()).toBe(stock);
  });

  it("customer can't cancel once packing has started; the store can, even out for delivery (stock returns)", async () => {
    const stock = await available();
    const { order } = await placeOrder(CUSTOMER, input());
    await adminUpdateOrderStatus(order.id, "packed", ADMIN);
    await expect(customerCancel(CUSTOMER, order.id)).rejects.toMatchObject({ status: 409 });
    await adminUpdateOrderStatus(order.id, "out_for_delivery", ADMIN);
    const o = await adminUpdateOrderStatus(order.id, "cancelled", ADMIN, "Customer not at home");
    expect(o.status).toBe("cancelled");
    expect(await available()).toBe(stock);
  });

  it("another customer can't cancel someone else's order", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    await expect(customerCancel("00000000-0000-4000-8000-0000000000c2", order.id)).rejects.toMatchObject({ status: 404 });
    expect((await getOrderById(order.id))!.status).toBe("placed");
  });
});

describe("prepaid orders and refunds", () => {
  it("UPI paid → customer cancels → refund pending → admin marks refunded", async () => {
    const stock = await available();
    const { order } = await placeOrder(CUSTOMER, input({ paymentMethod: "upi" }));
    expect(order.status).toBe("pending_payment");
    await adminConfirmUpiPayment(order.id, { id: ADMIN, email: null }, "412345678901");
    let o = await adminGetOrder(order.id);
    expect([o.status, o.paymentStatus]).toEqual(["placed", "paid"]);
    await customerCancel(CUSTOMER, order.id);
    o = await adminGetOrder(order.id);
    expect([o.status, o.paymentStatus]).toEqual(["cancelled", "refund_pending"]);
    expect(await available()).toBe(stock);
    expect((await adminUpdatePaymentStatus(order.id, "refunded", ADMIN)).paymentStatus).toBe("refunded");
    // A refund can't be "completed" twice or reopened.
    await expect(adminUpdatePaymentStatus(order.id, "refunded", ADMIN)).rejects.toMatchObject({ status: 409 });
  });

  it("unpaid online order: cancelled → nothing to refund", async () => {
    const { order } = await placeOrder(CUSTOMER, input({ paymentMethod: "upi" }));
    await customerCancel(CUSTOMER, order.id);
    const o = await adminGetOrder(order.id);
    expect([o.status, o.paymentStatus]).toEqual(["cancelled", "failed"]);
  });

  it("unpaid online order past its payment window is released automatically (stock back)", async () => {
    const stock = await available();
    const { order } = await placeOrder(CUSTOMER, input({ paymentMethod: "upi" }));
    await query("update orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [order.id]);
    await releaseExpired();
    const o = await adminGetOrder(order.id);
    expect(o.status).toBe("cancelled");
    expect(await available()).toBe(stock);
  });
});

describe("WhatsApp orders", () => {
  const wa = () =>
    whatsappOrderSchema.parse({
      items: [{ variantId: ITEM(), quantity: 4 }],
      customer: { name: "WA Guest", phone: `98${String(Date.now()).slice(-8)}`, address: `House ${randomUUID().slice(0, 4)}, Lane 1`, area: "", city: "Bengaluru", pincode: "560034", notes: "" },
      slotId: slot, deliveryDate: tomorrow, paymentMethod: "cod", idempotencyKey: randomUUID(),
    });

  it("waits for the store to confirm; confirmed → normal flow", async () => {
    const { order } = await placeWhatsAppOrder(null, wa());
    expect(order.status).toBe("pending_confirmation");
    expect((await adminUpdateOrderStatus(order.id, "placed", ADMIN)).status).toBe("placed");
    expect((await adminUpdateOrderStatus(order.id, "packed", ADMIN)).status).toBe("packed");
  });

  it("store declines it → cancelled, stock back", async () => {
    const stock = await available();
    const { order } = await placeWhatsAppOrder(null, wa());
    expect(await available()).toBeLessThan(stock);
    expect((await adminUpdateOrderStatus(order.id, "cancelled", ADMIN, "Couldn't reach the customer")).status).toBe("cancelled");
    expect(await available()).toBe(stock);
  });
});

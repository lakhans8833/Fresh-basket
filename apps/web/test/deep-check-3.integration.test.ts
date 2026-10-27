/**
 * Regression tests for the 27 Oct 2026 deep check (business-logic review):
 * - switching a weight product to per-pack stock can't multiply its kilos;
 * - a payment / WhatsApp confirmation after the booked delivery window ended doesn't promise a past slot;
 * - the store can cancel an order that is out for delivery (stock returns); customers still can't;
 * - abandoned unpaid orders give their stock back before the next quote.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { addDays, adminProductSchema, istDateString, NO_SLOT_LABEL, whatsappOrderSchema, type PlaceOrderInput } from "@freshbasket/shared";
import { pool, query, queryOne } from "@/lib/db";
import { customerCancel, placeOrder, placeWhatsAppOrder, releaseExpiredSoon } from "@/lib/orders";
import { adminConfirmUpiPayment } from "@/lib/payments/upi";
import { adminGetOrder, adminUpdateOrderStatus } from "@/lib/admin/orders";
import { adminGetProduct, adminSaveProduct } from "@/lib/admin/catalog";
import { buildQuote } from "@/lib/quote";

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const today = istDateString(new Date());
const tomorrow = addDays(today, 1);
const v: Record<string, string> = {};
let evening = "";
let n = 0;
const input = (o: Partial<PlaceOrderInput> = {}): PlaceOrderInput =>
  ({
    items: [{ variantId: v["tomato:500 g"]!, quantity: 4 }],
    address: { label: "Home", fullName: "Deep Check", phone: "9876543210", line1: `DC lane ${randomUUID().slice(0, 6)} ${++n}`, city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false },
    saveAddress: false, slotId: evening, deliveryDate: tomorrow, paymentMethod: "cod", idempotencyKey: randomUUID(), couponCode: null, customerNote: null, ...o,
  }) as PlaceOrderInput;
const stockOf = async (id: string) => (await queryOne<{ stock: number }>("select stock from product_variants where id = $1", [id]))!.stock;

beforeAll(async () => {
  for (const r of await query<{ id: string; slug: string; label: string }>("select v.id, p.slug, v.label from product_variants v join products p on p.id = v.product_id")) v[`${r.slug}:${r.label}`] = r.id;
  evening = (await queryOne<{ id: string }>("select id from delivery_slots where label = 'Evening'"))!.id;
  await query("update delivery_slots set capacity = 1000");
  await query("update store_settings set upi_id = 'freshbasket.test@okaxis'");
  await query("update product_variants set stock = greatest(stock, 200) where id = $1", [v["tomato:500 g"]]);
});
afterAll(async () => {
  await pool.end();
});

describe("weight product → per-pack stock", () => {
  async function weightProduct(grams: number) {
    const p = (await queryOne<{ id: string }>(
      `select p.id from products p where p.active and exists (select 1 from product_variants v where v.product_id = p.id and v.active)
         and not exists (select 1 from product_variants v where v.product_id = p.id and v.active and pack_label_grams(v.label) is null)
       order by p.id desc limit 1`,
    ))!;
    await query("update products set stock_grams = $2 where id = $1", [p.id, grams]);
    return (await adminGetProduct(p.id)) as unknown as {
      id: string; name: string; slug: string; categoryId: string; description: string | null; highlights: string[]; seasonal: boolean; featured: boolean; active: boolean;
      images: { url: string; alt: string | null }[]; variants: { id: string; label: string; price: number; mrp: number | null; stock: number; active: boolean; note: string | null }[];
    };
  }
  const save = (prod: Awaited<ReturnType<typeof weightProduct>>, stockFor: (label: string, derived: number) => number) =>
    adminSaveProduct(
      prod.id,
      adminProductSchema.parse({
        name: prod.name, slug: prod.slug, categoryId: prod.categoryId, description: prod.description, highlights: prod.highlights, seasonal: prod.seasonal,
        featured: prod.featured, active: prod.active, images: prod.images.map((i) => ({ url: i.url, alt: i.alt })), stockGrams: null,
        variants: [
          ...prod.variants.map((x, i) => ({ id: x.id, label: x.label, price: x.price, mrp: x.mrp, stock: stockFor(x.label, x.stock), stockLoaded: x.stock, sortOrder: i, active: x.active, note: x.note ?? null })),
          { label: "1 bunch", price: 2000, mrp: null, stock: 3, sortOrder: prod.variants.length, active: true, note: null },
        ],
      }),
    );

  it("keeping the derived counts (the same kilos in every pack) is refused", async () => {
    const prod = await weightProduct(12_000);
    await expect(save(prod, (_l, derived) => derived)).rejects.toMatchObject({ status: 400 });
    // Nothing changed: still stock by weight.
    expect(Number((await queryOne<{ g: string }>("select stock_grams as g from products where id = $1", [prod.id]))!.g)).toBe(12_000);
  });

  it("real per-pack counts that fit in the kilos are saved as typed", async () => {
    const prod = await weightProduct(12_000);
    await save(prod, (label) => (label === "1 kg" ? 4 : label === "500 g" ? 6 : 0)); // 4 kg + 3 kg ≤ 12 kg
    const rows = await query<{ label: string; stock: number }>("select label, stock from product_variants where product_id = $1 and active", [prod.id]);
    const by = Object.fromEntries(rows.map((r) => [r.label, r.stock]));
    expect(by["1 kg"] ?? 4).toBe(4);
    expect(by["1 bunch"]).toBe(3);
    expect((await queryOne<{ g: string | null }>("select stock_grams as g from products where id = $1", [prod.id]))!.g).toBeNull();
  });
});

describe("confirmed after the delivery window ended", () => {
  it("a UPI payment verified after the slot ended keeps the order but not the past slot", async () => {
    const { order } = await placeOrder(CUSTOMER, input({ paymentMethod: "upi" }));
    // The booked evening was two days ago (hold still running).
    await query("update orders set delivery_date = $2::date - 2 where id = $1", [order.id, today]);
    await adminConfirmUpiPayment(order.id, { id: ADMIN, email: null }, "512345678901");
    const o = await adminGetOrder(order.id);
    expect(o.status).toBe("placed");
    expect(o.paymentStatus).toBe("paid");
    expect(o.slotLabel).toBe(NO_SLOT_LABEL);
    expect(o.deliveryDate).toBe(today);
    expect(o.late).toBe(false);
  });

  it("a payment in time for its slot keeps the slot", async () => {
    const { order } = await placeOrder(CUSTOMER, input({ paymentMethod: "upi" }));
    await adminConfirmUpiPayment(order.id, { id: ADMIN, email: null }, "512345678902");
    const o = await adminGetOrder(order.id);
    expect(o.slotLabel).not.toBe(NO_SLOT_LABEL);
    expect(o.deliveryDate).toBe(tomorrow);
  });

  it("a WhatsApp order confirmed after its slot ended moves to a time agreed on WhatsApp, today", async () => {
    const wa = whatsappOrderSchema.parse({
      items: [{ variantId: v["tomato:500 g"]!, quantity: 4 }],
      customer: { name: "WA Buyer", phone: `97${String(Date.now()).slice(-8)}`, address: `House ${randomUUID().slice(0, 4)}, Lane 2`, area: "", city: "Bengaluru", pincode: "560034", notes: "" },
      slotId: evening, deliveryDate: tomorrow, paymentMethod: "cod", idempotencyKey: randomUUID(),
    });
    const { order } = await placeWhatsAppOrder(null, wa);
    expect(order.status).toBe("pending_confirmation");
    await query("update orders set delivery_date = $2::date - 1 where id = $1", [order.id, today]);
    const o = await adminUpdateOrderStatus(order.id, "placed", ADMIN);
    expect(o.status).toBe("placed");
    expect(o.slotLabel).toBe(NO_SLOT_LABEL);
    expect(o.deliveryDate).toBe(today);
  });
});

describe("failed delivery", () => {
  it("the store can cancel an order that is out for delivery; its stock comes back", async () => {
    const id = v["tomato:500 g"]!;
    const before = await stockOf(id);
    const { order } = await placeOrder(CUSTOMER, input());
    await adminUpdateOrderStatus(order.id, "packed", ADMIN);
    await adminUpdateOrderStatus(order.id, "out_for_delivery", ADMIN);
    await expect(customerCancel(CUSTOMER, order.id)).rejects.toMatchObject({ status: 409 });
    const o = await adminUpdateOrderStatus(order.id, "cancelled", ADMIN, "Customer not at home");
    expect(o.status).toBe("cancelled");
    expect(o.paymentStatus).toBe("cod_cancelled");
    expect(await stockOf(id)).toBe(before);
  });

  it("customers still can't cancel through the database function", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    await adminUpdateOrderStatus(order.id, "packed", ADMIN);
    await adminUpdateOrderStatus(order.id, "out_for_delivery", ADMIN);
    await expect(query("select cancel_order($1, 'customer', 'x')", [order.id])).rejects.toThrow(/can no longer be cancelled/);
  });
});

describe("abandoned unpaid orders", () => {
  it("give their stock back before the next quote", async () => {
    const id = v["tomato:500 g"]!;
    // Exactly 4 packs left (tomato may be sold by weight: then the shared kilos decide).
    await query("update products set stock_grams = case when stock_grams is null then null else 2000 end where id = (select product_id from product_variants where id = $1)", [id]);
    await query("update product_variants set stock = 4 where id = $1 and (select stock_grams from products p where p.id = product_id) is null", [id]);
    const want = { items: [{ variantId: id, quantity: 4 }], pincode: "560034" };
    const { order } = await placeOrder(CUSTOMER, input({ paymentMethod: "upi" }));
    const outOfStock = async () => (await buildQuote(want)).quote.issues.some((i) => i.code === "OUT_OF_STOCK");
    expect(await outOfStock()).toBe(true); // held by the unpaid order
    await query("update orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [order.id]);
    await releaseExpiredSoon();
    expect(await outOfStock()).toBe(false);
    await query("update products set stock_grams = case when stock_grams is null then null else 100000 end where id = (select product_id from product_variants where id = $1)", [id]);
    await query("update product_variants set stock = 200 where id = $1 and (select stock_grams from products p where p.id = product_id) is null", [id]);
  });
});

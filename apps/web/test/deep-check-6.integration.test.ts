/**
 * Regression tests for the 3 Nov 2026 audit (round 7): admin data integrity and after-delivery fixes.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const who = vi.hoisted(() => ({ role: "admin" as "staff" | "admin" }));
vi.mock("@/lib/auth", () => ({
  requireStaff: async () => ({ userId: "00000000-0000-4000-8000-0000000000a1", profile: { role: who.role, email: null } }),
  requireAdmin: async () => ({ userId: "00000000-0000-4000-8000-0000000000a1", profile: { role: "admin", email: null } }),
  getSession: async () => null,
}));

import { randomUUID } from "node:crypto";
import { addDays, adminCouponSchema, adminProductSchema, istDateString, type PlaceOrderInput } from "@freshbasket/shared";
import { pool, query, queryOne } from "@/lib/db";
import { placeOrder } from "@/lib/orders";
import { adminStats, adminUpdateOrderStatus, adminUpdatePaymentStatus, adminGetOrder } from "@/lib/admin/orders";
import { adminAnalytics } from "@/lib/admin/analytics";
import { adminGetProduct, adminSaveProduct } from "@/lib/admin/catalog";
import { adminAddAdjustment } from "@/lib/admin/adjustments";
import { PATCH as inventoryPatch } from "@/app/api/admin/inventory/route";

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const v: Record<string, string> = {};
let slot = "";
const input = (o: Partial<PlaceOrderInput> = {}): PlaceOrderInput =>
  ({
    items: [{ variantId: v["onion:1 kg"]!, quantity: 4 }, { variantId: v["tomato:500 g"]!, quantity: 4 }],
    address: { label: "Home", fullName: "Round Seven", phone: "9876543210", line1: `R7 lane ${randomUUID().slice(0, 6)}`, city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false },
    saveAddress: false, slotId: slot, deliveryDate: addDays(istDateString(new Date()), 1), paymentMethod: "cod", idempotencyKey: randomUUID(), couponCode: null, customerNote: null, ...o,
  }) as PlaceOrderInput;
async function delivered(o: Partial<PlaceOrderInput> = {}) {
  const { order } = await placeOrder(CUSTOMER, input(o));
  for (const s of ["packed", "out_for_delivery", "delivered"] as const) await adminUpdateOrderStatus(order.id, s, ADMIN);
  await adminUpdatePaymentStatus(order.id, "cod_collected", ADMIN);
  return (await adminGetOrder(order.id));
}
const patchInv = (body: unknown) =>
  inventoryPatch(new Request("http://x/api/admin/inventory", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), {} as never);
const available = async (variant: string) => {
  const r = (await queryOne<{ g: string | null; s: number }>(
    "select p.stock_grams::text as g, v.stock as s from product_variants v join products p on p.id = v.product_id where v.id = $1", [variant]))!;
  return r.g !== null ? Number(r.g) : r.s;
};

beforeAll(async () => {
  for (const r of await query<{ id: string; slug: string; label: string }>("select v.id, p.slug, v.label from product_variants v join products p on p.id = v.product_id")) v[`${r.slug}:${r.label}`] = r.id;
  slot = (await queryOne<{ id: string }>("select id from delivery_slots where label = 'Evening'"))!.id;
  await query("update delivery_slots set capacity = 1000");
  await query("update product_variants set stock = greatest(stock, 300) where id = any($1::uuid[])", [[v["onion:1 kg"], v["tomato:500 g"]]]);
  await query("update products set stock_grams = greatest(stock_grams, 300000) where stock_grams is not null and id in (select product_id from product_variants where id = any($1::uuid[]))", [[v["onion:1 kg"], v["tomato:500 g"]]]);
});
afterAll(async () => {
  await pool.end();
});

describe("refunds after delivery in the numbers", () => {
  it("analytics and today's revenue subtract them", async () => {
    const before = await adminAnalytics(7);
    const today0 = ((await adminStats()) as unknown as { revenueToday: number }).revenueToday;
    const o = await delivered();
    const onion = o.items.find((i) => i.variantId === v["onion:1 kg"])!;
    const mid = await adminAnalytics(7);
    expect(mid.totals.sales - before.totals.sales).toBe(o.total);
    await adminAddAdjustment(o.id, { kind: "refund", items: [{ itemId: onion.id, quantity: 1 }], amount: onion.unitPrice, reason: "one bag rotten" }, ADMIN);
    const after = await adminAnalytics(7);
    expect(after.totals.sales - before.totals.sales).toBe(o.total - onion.unitPrice);
    expect(after.totals.items - mid.totals.items).toBe(-1);
    expect((((await adminStats()) as unknown as { revenueToday: number }).revenueToday) - today0).toBe(o.total - onion.unitPrice);
  });

  it("a refund is capped at what was paid for the items (after the coupon)", async () => {
    await query("update coupons set min_order = 0, per_user_limit = null, first_order_only = false where code = 'FRESH10'");
    const o = await delivered({ couponCode: "FRESH10" });
    expect(o.discount).toBeGreaterThan(0);
    const onion = o.items.find((i) => i.variantId === v["onion:1 kg"])!;
    const paid = Math.floor((onion.unitPrice * (o.subtotal - o.discount)) / o.subtotal);
    await expect(adminAddAdjustment(o.id, { kind: "refund", items: [{ itemId: onion.id, quantity: 1 }], amount: onion.unitPrice, reason: "rotten" }, ADMIN)).rejects.toMatchObject({ status: 409 });
    await expect(adminAddAdjustment(o.id, { kind: "refund", items: [{ itemId: onion.id, quantity: 1 }], amount: paid, reason: "rotten" }, ADMIN)).resolves.toBeTruthy();
  });

  it("a replacement takes the goods from stock", async () => {
    const o = await delivered();
    const tomato = o.items.find((i) => i.variantId === v["tomato:500 g"])!;
    const before = await available(tomato.variantId!);
    await adminAddAdjustment(o.id, { kind: "replacement", items: [{ itemId: tomato.id, quantity: 2 }], amount: 0, reason: "squashed" }, ADMIN);
    expect(before - (await available(tomato.variantId!))).toBeGreaterThan(0);
  });
});

describe("product form vs. changes made meanwhile", () => {
  it("a price changed in Inventory isn't undone by saving the product form unchanged", async () => {
    const pid = (await queryOne<{ id: string }>("select product_id as id from product_variants where id = $1", [v["tomato:500 g"]]))!.id;
    const loaded = (await adminGetProduct(pid)) as unknown as {
      name: string; slug: string; categoryId: string; description: string | null; highlights: string[]; seasonal: boolean; featured: boolean; active: boolean;
      images: { url: string; alt: string | null }[]; variants: { id: string; label: string; price: number; mrp: number | null; stock: number; active: boolean; note: string | null }[];
    };
    // Meanwhile: the 500 g price is changed in Inventory.
    who.role = "admin";
    expect((await patchInv({ updates: [{ variantId: v["tomato:500 g"], price: 4400 }] })).status).toBe(200);
    // The admin saves the form opened before, changing only the description.
    await adminSaveProduct(pid, adminProductSchema.parse({
      name: loaded.name, slug: loaded.slug, categoryId: loaded.categoryId, description: "New description", highlights: loaded.highlights, seasonal: loaded.seasonal,
      featured: loaded.featured, active: loaded.active, images: loaded.images.map((i) => ({ url: i.url, alt: i.alt })),
      variants: loaded.variants.map((x, i) => ({ id: x.id, label: x.label, price: x.price, mrp: x.mrp, stock: x.stock, stockLoaded: x.stock, sortOrder: i, active: x.active, note: x.note,
        priceLoaded: x.price, mrpLoaded: x.mrp, activeLoaded: x.active })),
    }));
    expect((await queryOne<{ p: number }>("select price as p from product_variants where id = $1", [v["tomato:500 g"]]))!.p).toBe(4400);
  });
});

describe("inventory saves", () => {
  it("staff can't change prices; a retried save isn't applied twice; a price above the MRP clears it", async () => {
    const id = v["onion:1 kg"]!;
    const per = (await queryOne<{ g: string | null }>("select p.stock_grams::text as g from products p join product_variants x on x.product_id = p.id where x.id = $1", [id]))!.g;
    who.role = "staff";
    expect((await patchInv({ updates: [{ variantId: id, price: 9900 }] })).status).toBe(403);
    who.role = "admin";
    await query("update product_variants set mrp = 5000 where id = $1", [id]);
    expect((await patchInv({ updates: [{ variantId: id, price: 6400 }] })).status).toBe(200);
    expect((await queryOne<{ m: number | null }>("select mrp as m from product_variants where id = $1", [id]))!.m).toBeNull();
    // Retry with the same request id: applied once (per-pack stock product only — kilo products derive packs).
    if (per === null) {
      const s0 = await available(id);
      const body = { updates: [{ variantId: id, stock: s0 + 10, stockLoaded: s0 }], requestId: randomUUID() };
      await patchInv(body);
      await patchInv(body);
      expect(await available(id)).toBe(s0 + 10);
    } else {
      const pid = (await queryOne<{ id: string }>("select product_id as id from product_variants where id = $1", [id]))!.id;
      const g0 = await available(id);
      const body = { products: [{ productId: pid, stockGrams: g0 + 1000, stockGramsLoaded: g0 }], requestId: randomUUID() };
      await patchInv(body);
      await patchInv(body);
      expect(await available(id)).toBe(g0 + 1000);
    }
  });

  it("switching off every pack of a product is refused", async () => {
    const rows = await query<{ id: string }>("select id from product_variants where product_id = (select product_id from product_variants where id = $1) and active", [v["tomato:500 g"]]);
    expect((await patchInv({ updates: rows.map((r) => ({ variantId: r.id, active: false })) })).status).toBe(409);
  });

  it("prices below ₹1 are refused", async () => {
    expect((await patchInv({ updates: [{ variantId: v["onion:1 kg"], price: 50 }] })).status).toBe(400);
  });
});

describe("late orders and coupons", () => {
  it("'late' follows the window promised on the order, not the slot's current hours", async () => {
    const { order } = await placeOrder(CUSTOMER, input());
    await query("update orders set delivery_date = $2::date - 1, slot_label = 'Evening, 17:00–20:00' where id = $1", [order.id, istDateString(new Date())]);
    expect((await adminGetOrder(order.id)).late).toBe(true);
    await query("update orders set delivery_date = $2::date + 1 where id = $1", [order.id, istDateString(new Date())]);
    // The slot's hours changed to end earlier: the order (promised until 20:00 tomorrow) is still not late.
    await query("update delivery_slots set end_time = '18:00' where id = $1", [slot]);
    expect((await adminGetOrder(order.id)).late).toBe(false);
    await query("update delivery_slots set end_time = '20:00' where id = $1", [slot]);
  });

  it("a flat coupon needs a minimum order above its amount; a max discount of ₹0 is refused", () => {
    const base = { code: "FLAT500", kind: "flat" as const, value: 50000 };
    expect(adminCouponSchema.safeParse({ ...base, minOrder: 0 }).success).toBe(false);
    expect(adminCouponSchema.safeParse({ ...base, minOrder: 60000 }).success).toBe(true);
    expect(adminCouponSchema.safeParse({ code: "PCT10", kind: "percent", value: 10, maxDiscount: 0 }).success).toBe(false);
  });
});

/**
 * Integration tests (real Postgres with the production migrations — the isolated freshbasket_test DB)
 * for: shared weight stock across pack sizes (quote, checkout, admin list, dashboard), the single
 * effective minimum-order rule, service-area flags, the unavailable-item preference, "Buy again"
 * re-validation and the notification setup status. Nothing here talks to Supabase, Razorpay or WhatsApp.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { addDays, adminVariantSchema, istDateString, productStockSummary, whatsappOrderSchema, type PlaceOrderInput } from "@freshbasket/shared";
import { pool, query, queryOne } from "@/lib/db";
import { placeOrder, placeWhatsAppOrder, reorderItems } from "@/lib/orders";
import { buildQuote, toQuoteResponse } from "@/lib/quote";
import { getArea, serviceAreaMismatches } from "@/lib/delivery";
import { adminListProducts } from "@/lib/admin/catalog";
import { adminGetOrder, adminStats, adminUpdateOrderStatus } from "@/lib/admin/orders";
import { adminSaveProduct } from "@/lib/admin/catalog";
import { notificationSetup } from "@/lib/notify/whatsapp";

const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const tomorrow = addDays(istDateString(new Date()), 1);
let slot = "";
let mint = "";
const pack: Record<string, string> = {};
let n = 0;

const address = {
  label: "Home", fullName: "Test Customer", phone: "9876543210", line1: "7, Store Improvements Rd", city: "Bengaluru",
  state: "Karnataka", pincode: "560034", isDefault: false,
};
function input(o: Partial<PlaceOrderInput> = {}): PlaceOrderInput {
  return {
    items: [], address: { ...address, line1: `${address.line1}, flat ${++n}-${randomUUID().slice(0, 6)}` }, saveAddress: false,
    slotId: slot, deliveryDate: tomorrow, paymentMethod: "cod", idempotencyKey: randomUUID(), couponCode: null, customerNote: null, ...o,
  } as PlaceOrderInput;
}
const grams = async () => Number((await queryOne<{ g: string }>("select stock_grams as g from products where id = $1", [mint]))!.g);

beforeAll(async () => {
  slot = (await queryOne<{ id: string }>("select id from delivery_slots where label = 'Evening'"))!.id;
  await query("update delivery_slots set capacity = 1000");
  const cat = (await queryOne<{ id: string }>("select id from categories where slug = 'leafy-greens'"))!.id;
  mint = (await queryOne<{ id: string }>(
    "insert into products (slug, name, category_id) values ($1, 'Mint (test)', $2) returning id",
    [`mint-test-${randomUUID().slice(0, 8)}`, cat],
  ))!.id;
  for (const [label, price, sort] of [["100 g", 1000, 1], ["250 g", 2400, 2], ["500 g", 4500, 3], ["1 kg", 8500, 4]] as const) {
    pack[label] = (await queryOne<{ id: string }>(
      "insert into product_variants (product_id, label, price, sort_order) values ($1, $2, $3, $4) returning id",
      [mint, label, price, sort],
    ))!.id;
  }
  await query("update products set stock_grams = 2000 where id = $1", [mint]); // 2 kg shared by all four sizes
});

afterAll(async () => {
  await pool.end();
});

describe("shared weight stock (Mint, 2 kg)", () => {
  it("each size shows what the 2 kg could make; admin shows 2 kg, not 20+8+4+2 = 34", async () => {
    const stocks = await query<{ label: string; stock: number }>("select label, stock from product_variants where product_id = $1 order by sort_order", [mint]);
    expect(stocks.map((s) => s.stock)).toEqual([20, 8, 4, 2]);
    const row = (await adminListProducts("mint (test)")).find((p) => (p as { id: string }).id === mint) as { stockGrams: number; variants: { id: string; label: string; stock: number; active: boolean }[] };
    expect(row.stockGrams).toBe(2000);
    expect(productStockSummary(row.stockGrams, row.variants).text).toBe("2 kg in stock");
  });

  it("a basket mixing sizes can't use more than the shared total — every size involved is flagged", async () => {
    // 1 × 1 kg + 3 × 500 g = 2.5 kg > 2 kg
    const ctx = await buildQuote({ items: [{ variantId: pack["1 kg"]!, quantity: 1 }, { variantId: pack["500 g"]!, quantity: 3 }], pincode: "560034" });
    const issues = ctx.quote.issues.filter((i) => i.code === "OUT_OF_STOCK");
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.code === "OUT_OF_STOCK" && i.shared)).toBe(true);
    const max = Object.fromEntries(ctx.quote.lines.map((l) => [l.variantId, l.maxQuantity]));
    expect(max[pack["1 kg"]!]).toBe(0); // 1.5 kg of 500 g packs leave 500 g
    expect(max[pack["500 g"]!]).toBe(2); // 1 kg pack leaves 1 kg
    expect(toQuoteResponse(ctx).messages[pack["500 g"]!]).toMatch(/other sizes of this item/);
    await expect(placeOrder(CUSTOMER, input({ items: [{ variantId: pack["1 kg"]!, quantity: 1 }, { variantId: pack["500 g"]!, quantity: 3 }] }))).rejects.toMatchObject({ status: 409 });
    expect(await grams()).toBe(2000); // nothing taken
  });

  it("exactly the total is fine, and checkout takes the grams once", async () => {
    const { order } = await placeOrder(CUSTOMER, input({ items: [{ variantId: pack["1 kg"]!, quantity: 1 }, { variantId: pack["500 g"]!, quantity: 1 }, { variantId: pack["250 g"]!, quantity: 2 }] }));
    expect(order.status).toBe("placed");
    expect(await grams()).toBe(0);
    const left = await query<{ stock: number }>("select stock from product_variants where product_id = $1", [mint]);
    expect(left.every((r) => r.stock === 0)).toBe(true);
  });

  it("the dashboard judges low stock per product for shared stock (one row, in grams)", async () => {
    await query("update products set stock_grams = 300 where id = $1", [mint]); // makes 3 × 100 g: low, not out
    let row = ((await adminStats()) as unknown as { lowStock: { productId: string; variantId: string | null; stockGrams: number | null; out: boolean }[] }).lowStock.filter((r) => r.productId === mint);
    expect(row).toEqual([expect.objectContaining({ variantId: null, stockGrams: 300, out: false })]);
    await query("update products set stock_grams = 3000 where id = $1", [mint]); // 30 × 100 g: fine (the 1 kg size making only 3 is not "low")
    row = ((await adminStats()) as unknown as { lowStock: typeof row }).lowStock.filter((r) => r.productId === mint);
    expect(row).toEqual([]);
  });
});

describe("one minimum-order rule: the higher of the area's and the store-wide minimum", () => {
  it("an area with no minimum of its own still shows and enforces the store-wide minimum", async () => {
    const before = await queryOne<{ s: number; a: number }>("select (select default_min_order from store_settings where id) as s, (select min_order from delivery_areas where pincode = '560034') as a");
    try {
      await query("update store_settings set default_min_order = 9900 where id");
      await query("update delivery_areas set min_order = 0 where pincode = '560034'");
      const area = (await getArea("560034"))!;
      expect(area.minOrder).toBe(9900); // what the PIN check / policy show
      expect(area.areaMinOrder).toBe(0);
      const ctx = await buildQuote({ items: [{ variantId: pack["100 g"]!, quantity: 1 }], pincode: "560034" });
      expect(ctx.quote.issues).toContainEqual(expect.objectContaining({ code: "BELOW_MIN_ORDER", minOrder: 9900 }));
      expect(toQuoteResponse(ctx).minOrder).toBe(9900);
      // Before a PIN code is known the store-wide minimum is reported too.
      expect(toQuoteResponse(await buildQuote({ items: [{ variantId: pack["100 g"]!, quantity: 1 }] })).minOrder).toBe(9900);
      // An area minimum above the store-wide one wins.
      await query("update delivery_areas set min_order = 14900 where pincode = '560034'");
      expect((await getArea("560034"))!.minOrder).toBe(14900);
    } finally {
      await query("update store_settings set default_min_order = $1 where id", [before!.s]);
      await query("update delivery_areas set min_order = $1 where pincode = '560034'", [before!.a]);
    }
  });
});

describe("service-area flags", () => {
  it("flags active areas whose PIN is in another state than the store (Bengaluru vs Faridabad, Haryana)", () => {
    const flagged = serviceAreaMismatches([
      { id: "a", pincode: "560034", areaName: "Koramangala", city: "Bengaluru", active: true },
      { id: "b", pincode: "121006", areaName: "Sector 21", city: "Faridabad", active: true },
      { id: "c", pincode: "560038", areaName: "Indiranagar", city: "Bengaluru", active: false },
    ]);
    expect(flagged.map((f) => f.id)).toEqual(["a"]);
    expect(flagged[0]).toMatchObject({ pinState: "Karnataka", storeState: "Haryana" });
  });
});

describe("unavailable-item preference", () => {
  it("is saved with the order (default: call first) and never means 'substitute'", async () => {
    await query("update products set stock_grams = 5000 where id = $1", [mint]);
    const a = await placeOrder(CUSTOMER, input({ items: [{ variantId: pack["1 kg"]!, quantity: 2 }] }));
    expect(a.order.unavailableItems).toBe("call");
    const b = await placeOrder(CUSTOMER, input({ items: [{ variantId: pack["1 kg"]!, quantity: 2 }], unavailableItems: "remove" }));
    expect(b.order.unavailableItems).toBe("remove");
    await expect(query("update orders set unavailable_item_preference = 'substitute' where id = $1", [b.order.id])).rejects.toThrow();
  });
});

describe("Buy again re-validates today's prices, availability and stock", () => {
  it("reports a changed price, caps to the shared stock and skips items whose category was hidden", async () => {
    await query("update products set stock_grams = 5000 where id = $1", [mint]);
    const tomato = (await queryOne<{ id: string; price: number }>("select v.id, v.price from product_variants v join products p on p.id = v.product_id where p.slug = 'tomato' and v.label = '500 g'"))!;
    const { order } = await placeOrder(CUSTOMER, input({ items: [{ variantId: pack["1 kg"]!, quantity: 3 }, { variantId: pack["500 g"]!, quantity: 2 }, { variantId: tomato.id, quantity: 4 }] }));
    // Since then: Mint's 1 kg price went up, only 2.5 kg are left, and the Tomato category was hidden.
    await query("update product_variants set price = 9900 where id = $1", [pack["1 kg"]]);
    await query("update products set stock_grams = 2500 where id = $1", [mint]);
    const tomatoCat = (await queryOne<{ id: string }>("select category_id as id from products where slug = 'tomato'"))!.id;
    await query("update categories set active = false where id = $1", [tomatoCat]);
    try {
      const r = await reorderItems(CUSTOMER, order.id);
      const kg = r.items.find((i) => i.variantId === pack["1 kg"])!;
      const half = r.items.find((i) => i.variantId === pack["500 g"])!;
      expect(kg).toMatchObject({ requested: 3, price: 9900, oldPrice: 8500 }); // today's price, change reported
      expect(half).toMatchObject({ requested: 2, price: 4500, oldPrice: 4500 });
      // Asked for 3 kg + 1 kg with 2.5 kg left: the sizes share it — never more than 2.5 kg in total.
      const used = kg.quantity * 1000 + half.quantity * 500;
      expect(used).toBeLessThanOrEqual(2500);
      expect(used).toBeGreaterThanOrEqual(2000);
      expect(kg.quantity < 3 || half.quantity < 2).toBe(true);
      expect(r.skipped).toEqual([expect.objectContaining({ productName: expect.stringMatching(/tomato/i), reason: "unavailable" })]);
    } finally {
      await query("update categories set active = true where id = $1", [tomatoCat]);
      await query("update product_variants set price = 8500 where id = $1", [pack["1 kg"]]);
    }
  });
});

describe("order notifications status for the admin", () => {
  it("names the missing settings (never values) and is ready only when every event has a template", () => {
    const off = notificationSetup({ apiVersion: "v21.0", apiBase: "https://example.invalid", language: "en", templates: {} });
    expect(off.configured).toBe(false);
    expect(off.missing).toEqual(expect.arrayContaining(["WHATSAPP_CLOUD_ACCESS_TOKEN", "WHATSAPP_CLOUD_PHONE_NUMBER_ID", "WHATSAPP_TEMPLATE_ORDER_PACKED"]));
    const partial = notificationSetup({ accessToken: "t", phoneNumberId: "p", apiVersion: "v21.0", apiBase: "x", language: "en", templates: { confirmed: "c" } });
    expect(partial).toMatchObject({ configured: true, allEventsReady: false });
    expect(partial.missing).not.toContain("WHATSAPP_CLOUD_ACCESS_TOKEN");
    const ready = notificationSetup({ accessToken: "t", phoneNumberId: "p", apiVersion: "v21.0", apiBase: "x", language: "en", templates: { confirmed: "a", packed: "b", out_for_delivery: "c", delivered: "d" } });
    expect(ready).toMatchObject({ allEventsReady: true, missing: [] });
  });
});

// ---------------------------------------------------------------------------------------------
// Regressions found in the deep check
// ---------------------------------------------------------------------------------------------
const ADMIN = "00000000-0000-4000-8000-0000000000a1";

describe("deep-check regressions", () => {
  it("a switched-off size in the basket doesn't use up the shared stock of the sizes still on sale", async () => {
    await query("update products set stock_grams = 1000 where id = $1", [mint]);
    await query("update product_variants set active = false where id = $1", [pack["250 g"]]);
    try {
      const ctx = await buildQuote({ items: [{ variantId: pack["500 g"]!, quantity: 2 }, { variantId: pack["250 g"]!, quantity: 4 }], pincode: "560034" });
      expect(ctx.quote.issues).toContainEqual({ code: "UNAVAILABLE", variantId: pack["250 g"] });
      expect(ctx.quote.issues.find((i) => i.code === "OUT_OF_STOCK")).toBeUndefined(); // 2 × 500 g fit in 1 kg
      expect(ctx.quote.lines.find((l) => l.variantId === pack["500 g"])!.maxQuantity).toBe(2);
    } finally {
      await query("update product_variants set active = true where id = $1", [pack["250 g"]]);
    }
  });

  it("Buy again tops up the CURRENT cart within the shared stock (never past the total)", async () => {
    await query("update products set stock_grams = 5000 where id = $1", [mint]);
    const { order } = await placeOrder(CUSTOMER, input({ items: [{ variantId: pack["500 g"]!, quantity: 4 }] }));
    await query("update products set stock_grams = 2000 where id = $1", [mint]);
    // Cart already holds 2 × 1 kg = all 2 kg.
    const full = await reorderItems(CUSTOMER, order.id, [{ variantId: pack["1 kg"]!, quantity: 2 }]);
    expect(full.items).toEqual([]);
    expect(full.skipped).toEqual([expect.objectContaining({ reason: "out_of_stock" })]);
    // Cart holds 1 × 1 kg → 1 kg left → at most 2 × 500 g more.
    const some = await reorderItems(CUSTOMER, order.id, [{ variantId: pack["1 kg"]!, quantity: 1 }]);
    expect(some.items[0]).toMatchObject({ variantId: pack["500 g"], quantity: 2, requested: 4, inCart: 0 });
    // The same pack already in the cart is topped up, not doubled.
    const same = await reorderItems(CUSTOMER, order.id, [{ variantId: pack["500 g"]!, quantity: 3 }]);
    expect(same.items[0]).toMatchObject({ quantity: 1, inCart: 3 });
  });

  it("saving a weight product that has a HIDDEN non-weight size keeps its shared total", async () => {
    const extra = (await queryOne<{ id: string }>("insert into product_variants (product_id, label, price, active, sort_order) values ($1, '1 bunch', 1500, false, 9) returning id", [mint]))!.id;
    try {
      await query("update products set stock_grams = 2000 where id = $1", [mint]);
      const p = (await queryOne<{ slug: string; name: string; category_id: string }>("select slug, name, category_id from products where id = $1", [mint]))!;
      const vs = await query<{ id: string; label: string; price: number; stock: number; active: boolean }>("select id, label, price, stock, active from product_variants where product_id = $1 order by sort_order", [mint]);
      await adminSaveProduct(mint, {
        name: p.name, slug: p.slug, categoryId: p.category_id, description: "Updated description", highlights: [], seasonal: false, featured: false, active: true,
        storageTips: null, shelfLife: null, origin: null, nutrition: null, images: [],
        variants: vs.map((v, i) => ({ id: v.id, label: v.label, price: v.price, mrp: null, stock: v.stock, active: v.active, sortOrder: i + 1 })),
        stockGrams: 2000,
      } as Parameters<typeof adminSaveProduct>[1]);
      expect(await grams()).toBe(2000);
    } finally {
      await query("delete from product_variants where id = $1", [extra]);
    }
  });

  it("pack labels with a non-breaking space are read as weights by the database and normalised on save", async () => {
    expect((await queryOne<{ g: number }>("select pack_label_grams($1) as g", ["500\u00a0g"]))!.g).toBe(500);
    expect(adminVariantSchema.parse({ label: "500\u00a0g", price: 100, stock: 0, active: true }).label).toBe("500 g");
  });

  it("unconfirmed WhatsApp orders are not 'overdue'; confirming a slot-less order after its day moves it to today", async () => {
    const wa = whatsappOrderSchema.parse({
      items: [{ variantId: pack["1 kg"]!, quantity: 2 }],
      customer: { name: "Guest Buyer", phone: `97${String(Date.now()).slice(-8)}`, address: "House 9, Lane 3", area: "", city: "Bengaluru", pincode: "560034", notes: "" },
      paymentMethod: "cod", idempotencyKey: randomUUID(),
    });
    await query("update products set stock_grams = 9000 where id = $1", [mint]);
    const { order } = await placeWhatsAppOrder(null, wa);
    expect(order.status).toBe("pending_confirmation");
    await query("update orders set delivery_date = delivery_date - 1 where id = $1", [order.id]); // placed late last night
    expect((await adminGetOrder(order.id)).late).toBe(false); // waiting for confirmation ≠ overdue
    await adminUpdateOrderStatus(order.id, "placed", ADMIN);
    const confirmed = await adminGetOrder(order.id);
    expect(confirmed.deliveryDate).toBe(istDateString(new Date()));
    expect(confirmed.late).toBe(false);
  });

  it("a guest retry with the same key but another mobile number gets a clear 409 (not a raw database error)", async () => {
    const key = randomUUID();
    const base = { items: [{ variantId: pack["1 kg"]!, quantity: 2 }], paymentMethod: "cod", idempotencyKey: key };
    const c = (phone: string) => ({ name: "Guest Buyer", phone, address: "House 10, Lane 4", area: "", city: "Bengaluru", pincode: "560034", notes: "" });
    await placeWhatsAppOrder(null, whatsappOrderSchema.parse({ ...base, customer: c(`96${String(Date.now()).slice(-8)}`) }));
    await expect(placeWhatsAppOrder(null, whatsappOrderSchema.parse({ ...base, customer: c(`95${String(Date.now()).slice(-8)}`) }))).rejects.toMatchObject({ status: 409 });
  });

  it("dashboard recent orders carry the full order (channel, item preference)", async () => {
    await query("update products set stock_grams = 9000 where id = $1", [mint]);
    const { order } = await placeOrder(CUSTOMER, input({ items: [{ variantId: pack["1 kg"]!, quantity: 2 }], unavailableItems: "remove" }));
    const recent = ((await adminStats()) as unknown as { recent: { id: string; channel: string; unavailableItems: string | null }[] }).recent.find((o) => o.id === order.id)!;
    expect(recent).toMatchObject({ channel: "web", unavailableItems: "remove" });
  });
});

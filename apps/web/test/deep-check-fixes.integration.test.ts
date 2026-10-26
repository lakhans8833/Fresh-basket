/**
 * Regression tests for the 26 Oct 2026 backend deep check:
 * - turning "total stock in kg" off keeps the per-pack stock typed in (no 4× overselling);
 * - a kg total saved from the product form keeps sales made while the form was open;
 * - impossible delivery dates and out-of-range coupon / settings numbers are a 400, not a database error.
 */
import { afterAll, describe, expect, it } from "vitest";
import { adminCouponSchema, adminProductSchema, placeOrderSchema, whatsappOrderSchema } from "@freshbasket/shared";
import { pool, query, queryOne } from "@/lib/db";
import { adminGetProduct, adminSaveProduct } from "@/lib/admin/catalog";

afterAll(async () => { await pool.end(); });

interface Loaded {
  id: string; name: string; slug: string; categoryId: string; description: string | null; highlights: string[];
  seasonal: boolean; featured: boolean; active: boolean; images: { url: string; alt: string | null }[];
  variants: { id: string; label: string; price: number; mrp: number | null; stock: number; active: boolean; note: string | null }[];
}

/** A product whose packs are all weights (100 g … 1 kg), switched to stock by weight with `grams`. */
async function weightProduct(grams: number) {
  const p = (await queryOne<{ id: string }>(
    `select p.id from products p where p.active and exists (select 1 from product_variants v where v.product_id = p.id and v.active)
       and not exists (select 1 from product_variants v where v.product_id = p.id and v.active and pack_label_grams(v.label) is null)
     order by p.id limit 1`,
  ))!;
  await query("update products set stock_grams = $2 where id = $1", [p.id, grams]);
  return (await adminGetProduct(p.id)) as unknown as Loaded;
}
const input = (prod: Loaded, patch: Record<string, unknown>) =>
  adminProductSchema.parse({
    name: prod.name, slug: prod.slug, categoryId: prod.categoryId, description: prod.description, highlights: prod.highlights,
    seasonal: prod.seasonal, featured: prod.featured, active: prod.active, images: prod.images.map((i) => ({ url: i.url, alt: i.alt })),
    variants: prod.variants.map((v, i) => ({ id: v.id, label: v.label, price: v.price, mrp: v.mrp, stock: v.stock, stockLoaded: v.stock, sortOrder: i, active: v.active, note: v.note ?? null })),
    ...patch,
  });

describe("stock by weight ↔ stock per pack", () => {
  it("turning the kg total off keeps the per-pack numbers typed in", async () => {
    const prod = await weightProduct(50_000);
    const derived = prod.variants.map((v) => v.stock);
    expect(Math.max(...derived)).toBeGreaterThan(5); // 50 kg gives many packs of each size
    const d = input(prod, { stockGrams: null, variants: prod.variants.map((v, i) => ({ id: v.id, label: v.label, price: v.price, mrp: v.mrp, stock: 5, stockLoaded: v.stock, sortOrder: i, active: v.active, note: v.note ?? null })) });
    await adminSaveProduct(prod.id, d);
    const after = await query<{ stock: number }>("select stock from product_variants where product_id = $1 and id = any($2::uuid[])", [prod.id, prod.variants.map((v) => v.id)]);
    expect(after.every((r) => r.stock === 5)).toBe(true);
    expect((await queryOne<{ g: string | null }>("select stock_grams as g from products where id = $1", [prod.id]))!.g).toBeNull();
  });

  it("a kg total saved from the form keeps grams sold while the form was open", async () => {
    const prod = await weightProduct(10_000);
    await query("update products set stock_grams = stock_grams - 2500 where id = $1", [prod.id]); // sold meanwhile
    await adminSaveProduct(prod.id, input(prod, { stockGrams: 15_000, stockGramsLoaded: 10_000 }));
    expect(Number((await queryOne<{ g: string }>("select stock_grams as g from products where id = $1", [prod.id]))!.g)).toBe(12_500);
    // Without the loaded value (older clients) the number is set as given.
    await adminSaveProduct(prod.id, input(prod, { stockGrams: 9_000 }));
    expect(Number((await queryOne<{ g: string }>("select stock_grams as g from products where id = $1", [prod.id]))!.g)).toBe(9_000);
  });
});

describe("input limits", () => {
  const order = { items: [{ variantId: "00000000-0000-4000-8000-000000000001", quantity: 1 }], slotId: "00000000-0000-4000-8000-000000000002", paymentMethod: "cod" as const, idempotencyKey: "abcdefgh12", addressId: "00000000-0000-4000-8000-000000000003" };
  it("impossible delivery dates are refused before reaching the database", () => {
    for (const bad of ["2026-10-99", "2026-02-30", "2026-13-01"]) {
      expect(placeOrderSchema.safeParse({ ...order, deliveryDate: bad }).success).toBe(false);
    }
    expect(placeOrderSchema.safeParse({ ...order, deliveryDate: "2026-10-31" }).success).toBe(true);
    const wa = { items: order.items, customer: { name: "A B", phone: "9876543210", address: "12 Main Road", area: "Sector 8", city: "Faridabad", pincode: "121006" }, paymentMethod: "cod", idempotencyKey: "abcdefgh12" };
    const ok = whatsappOrderSchema.safeParse({ ...wa, deliveryDate: "2026-10-31", slotId: order.slotId });
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    expect(whatsappOrderSchema.safeParse({ ...wa, deliveryDate: "2026-02-30", slotId: order.slotId }).success).toBe(false);
  });
  it("coupon numbers and dates stay in range", () => {
    const c = { code: "TEST10", kind: "flat", value: 1000 };
    expect(adminCouponSchema.safeParse(c).success).toBe(true);
    expect(adminCouponSchema.safeParse({ ...c, minOrder: 99_999_999_999 }).success).toBe(false);
    expect(adminCouponSchema.safeParse({ ...c, usageLimit: 3_000_000_000 }).success).toBe(false);
    expect(adminCouponSchema.safeParse({ ...c, startsAt: "not a date" }).success).toBe(false);
    expect(adminCouponSchema.safeParse({ ...c, startsAt: "2026-11-02T10:00:00.000Z", endsAt: "2026-11-01T10:00:00.000Z" }).success).toBe(false);
    expect(adminCouponSchema.safeParse({ ...c, startsAt: "2026-11-01T10:00:00.000Z", endsAt: "2026-11-02T10:00:00.000Z" }).success).toBe(true);
  });
});

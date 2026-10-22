/**
 * Regression tests for the 23 Oct 2026 bug audit:
 * - dev login / dev secret never on a Vercel production deployment, even with ALLOW_DEV_MODE=true;
 * - inventory stock edits don't undo sales made while the table was open;
 * - admin schemas refuse a ₹0 price, an MRP below the price and an out-of-range free-delivery threshold.
 */
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { adminDeliveryAreaSchema, adminInventoryPatchSchema, adminProductSchema } from "@freshbasket/shared";
import { pool, query, queryOne, tx } from "@/lib/db";
import { adminPatchInventory } from "@/lib/admin/catalog";

afterAll(async () => { await pool.end(); });

describe("dev features and Vercel production", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  const load = async (vars: Record<string, string>) => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("APP_SECRET", "");
    for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
    return (await import("@/lib/env")).env;
  };

  it("ALLOW_DEV_MODE=true on VERCEL_ENV=production: no dev login, no local uploads, no built-in secret", async () => {
    const env = await load({ NODE_ENV: "production", VERCEL_ENV: "production", ALLOW_DEV_MODE: "true" });
    expect(env.devFeaturesAllowed).toBe(false);
    expect(env.auth.mode).toBe("unconfigured");
    expect(env.storage.mode).toBe("none");
    expect(env.appSecret).toBeUndefined();
    expect(env.payments.online).toBeNull();
  });

  it("still available for a local production build (next start) and Vercel previews when asked for", async () => {
    expect((await load({ NODE_ENV: "production", ALLOW_DEV_MODE: "true", VERCEL_ENV: "" })).auth.mode).toBe("dev");
    expect((await load({ NODE_ENV: "production", ALLOW_DEV_MODE: "true", VERCEL_ENV: "preview" })).auth.mode).toBe("dev");
    expect((await load({ NODE_ENV: "production", ALLOW_DEV_MODE: "", VERCEL_ENV: "" })).auth.mode).toBe("unconfigured");
  });
});

describe("inventory edits keep sales made meanwhile", () => {
  const pack = async () =>
    (await queryOne<{ id: string; product_id: string }>(
      `select v.id, v.product_id from product_variants v join products p on p.id = v.product_id
        where p.stock_grams is null and v.active and p.active order by v.id limit 1`,
    ))!;
  const stockOf = async (id: string) => (await queryOne<{ stock: number }>("select stock from product_variants where id = $1", [id]))!.stock;

  it("88 loaded → 14 sold → staff types 98 (received 10) → 84, not 98", async () => {
    const v = await pack();
    await query("update product_variants set stock = 88 where id = $1", [v.id]);
    await tx(async (c) => { await c.query("select take_stock($1, 14)", [v.id]); });
    expect(await stockOf(v.id)).toBe(74);
    await adminPatchInventory([{ variantId: v.id, stock: 98, stockLoaded: 88 }]);
    expect(await stockOf(v.id)).toBe(84);
  });

  it("never below zero; without stockLoaded the value is set as given (older clients)", async () => {
    const v = await pack();
    await query("update product_variants set stock = 5 where id = $1", [v.id]);
    await adminPatchInventory([{ variantId: v.id, stock: 0, stockLoaded: 50 }]);
    expect(await stockOf(v.id)).toBe(0);
    await adminPatchInventory([{ variantId: v.id, stock: 33 }]);
    expect(await stockOf(v.id)).toBe(33);
  });

  it("stock-by-weight totals follow the same rule", async () => {
    const p = (await queryOne<{ id: string }>("select id from products where stock_grams is not null order by id limit 1"))!;
    await query("update products set stock_grams = 10000 where id = $1", [p.id]);
    await query("update products set stock_grams = stock_grams - 2500 where id = $1", [p.id]); // sold meanwhile
    await adminPatchInventory([], [{ productId: p.id, stockGrams: 15000, stockGramsLoaded: 10000 }]);
    expect(Number((await queryOne<{ g: string }>("select stock_grams as g from products where id = $1", [p.id]))!.g)).toBe(12500);
  });
});

describe("admin input validation", () => {
  const base = { name: "Test", slug: "test-x", categoryId: "00000000-0000-4000-8000-000000000001" };
  it("a ₹0 price is refused (product form and inventory)", () => {
    expect(adminProductSchema.safeParse({ ...base, variants: [{ label: "1 kg", price: 0, stock: 1 }] }).success).toBe(false);
    expect(adminInventoryPatchSchema.safeParse({ updates: [{ variantId: base.categoryId, price: 0 }] }).success).toBe(false);
    expect(adminProductSchema.safeParse({ ...base, variants: [{ label: "1 kg", price: 100, stock: 1 }] }).success).toBe(true);
  });
  it("MRP below the price is refused; no MRP is fine", () => {
    expect(adminProductSchema.safeParse({ ...base, variants: [{ label: "1 kg", price: 5000, mrp: 100, stock: 1 }] }).success).toBe(false);
    expect(adminProductSchema.safeParse({ ...base, variants: [{ label: "1 kg", price: 5000, mrp: null, stock: 1 }] }).success).toBe(true);
    expect(adminProductSchema.safeParse({ ...base, variants: [{ label: "1 kg", price: 5000, mrp: 6000, stock: 1 }] }).success).toBe(true);
  });
  it("a huge free-delivery threshold is a 400, not a database overflow", () => {
    const area = { pincode: "560034", areaName: "Koramangala", city: "Bengaluru", fee: 2000, minOrder: 0 };
    expect(adminDeliveryAreaSchema.safeParse({ ...area, freeAbove: 99_999_999_999 }).success).toBe(false);
    expect(adminDeliveryAreaSchema.safeParse({ ...area, freeAbove: 49_900 }).success).toBe(true);
  });
});

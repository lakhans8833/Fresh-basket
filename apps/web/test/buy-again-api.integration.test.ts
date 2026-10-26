/**
 * GET /api/me/buy-again (phone app "Buy again" row): signed-in customers get the products from their
 * own past (not cancelled) orders, newest first, with the pack bought last time; signed out → 401.
 * The session is mocked; products and orders come from the test database.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";

const who = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (!who.userId) throw new HttpError(401, "Please sign in to continue.", "UNAUTHORIZED");
    return { userId: who.userId };
  },
}));

import { randomUUID } from "node:crypto";
import { addDays, istDateString, type PlaceOrderInput } from "@freshbasket/shared";
import { pool, query, queryOne } from "@/lib/db";
import { placeOrder } from "@/lib/orders";
import { GET } from "@/app/api/me/buy-again/route";

const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
let tomato500 = "", potato1kg = "";

beforeAll(async () => {
  const id = async (slug: string, label: string) =>
    (await queryOne<{ id: string }>("select v.id from product_variants v join products p on p.id = v.product_id where p.slug = $1 and v.label = $2", [slug, label]))!.id;
  tomato500 = await id("tomato", "500 g");
  potato1kg = await id("potato", "1 kg");
  await query("update delivery_slots set capacity = 1000");
  const slot = (await queryOne<{ id: string }>("select id from delivery_slots where label = 'Evening'"))!.id;
  const base = (variantId: string, quantity: number, n: number): PlaceOrderInput => ({
    items: [{ variantId, quantity }], saveAddress: false, slotId: slot, deliveryDate: addDays(istDateString(new Date()), 1), paymentMethod: "cod",
    address: { label: "Home", fullName: "Buy Again", phone: "9876543210", line1: `12, 4th Cross, flat ${n}`, city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false },
    idempotencyKey: randomUUID(), couponCode: null, customerNote: null,
  } as PlaceOrderInput);
  await placeOrder(CUSTOMER, base(tomato500, 4, 901)); // older
  await query("update orders set created_at = now() - interval '1 day' where user_id = $1", [CUSTOMER]);
  await placeOrder(CUSTOMER, base(potato1kg, 2, 902)); // newest
});
afterAll(async () => { await pool.end(); });
beforeEach(() => { who.userId = null; });

const call = async () => {
  const res = await GET(new Request("https://shop.example/api/me/buy-again"), { params: Promise.resolve({}) } as never);
  return { status: res.status, body: await res.json() };
};

describe("/api/me/buy-again", () => {
  it("signed out → 401", async () => {
    expect((await call()).status).toBe(401);
  });

  it("signed in → my past products, newest first, each opening on the pack bought last time", async () => {
    who.userId = CUSTOMER;
    const { status, body } = await call();
    expect(status).toBe(200);
    const mine = await query<{ product_id: string }>(
      `select distinct oi.product_id from order_items oi join orders o on o.id = oi.order_id
        where o.user_id = $1 and o.status <> 'cancelled' and oi.product_id is not null`,
      [CUSTOMER],
    );
    const ids = new Set(mine.map((r) => r.product_id));
    const products = body.products as { id: string; slug: string }[];
    expect(products.length).toBeGreaterThanOrEqual(2);
    expect(products.every((p) => ids.has(p.id))).toBe(true); // never someone else's products
    expect(products[0]!.slug).toBe("potato"); // newest order first
    expect(body.lastVariant[products[0]!.id]).toBe(potato1kg);
    expect(body.lastVariant[products.find((p) => p.slug === "tomato")!.id]).toBe(tomato500);
  });
});

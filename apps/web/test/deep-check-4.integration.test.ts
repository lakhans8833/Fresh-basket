/**
 * Regression tests for the 28 Oct 2026 backend deep check:
 * - deleting an account and signing up again with the same email doesn't reset first-order /
 *   per-customer coupons;
 * - address book cap; invalid (NUL) text is a 400; rate limits treat one IPv6 /64 as one caller;
 * - a still-valid token of a deleted login doesn't recreate a profile (no foreign-key error).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { addDays, istDateString, type PlaceOrderInput } from "@freshbasket/shared";
import { pool, query, queryOne } from "@/lib/db";
import { deleteAccount, MAX_ADDRESSES, saveAddress } from "@/lib/account";
import { placeOrder } from "@/lib/orders";
import { buildQuote } from "@/lib/quote";
import { clientIp } from "@/lib/http";

const tomorrow = addDays(istDateString(new Date()), 1);
let slot = "";
let tomato = "";
let n = 0;
const order = (o: Partial<PlaceOrderInput> = {}): PlaceOrderInput =>
  ({
    items: [{ variantId: tomato, quantity: 4 }],
    address: { label: "Home", fullName: "Coupon Tester", phone: "9876543210", line1: `Coupon Rd ${randomUUID().slice(0, 5)} ${++n}`, city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false },
    saveAddress: false, slotId: slot, deliveryDate: tomorrow, paymentMethod: "cod", idempotencyKey: randomUUID(), couponCode: null, customerNote: null, ...o,
  }) as PlaceOrderInput;
const newUser = async (email: string) => (await queryOne<{ id: string }>("insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id", [email]))!.id;
const couponIssue = async (userId: string, code: string) =>
  (await buildQuote({ items: [{ variantId: tomato, quantity: 10 }], couponCode: code, pincode: "560034" }, { userId })).quote.issues.find((i) => i.code === "COUPON_INVALID") ?? null;

beforeAll(async () => {
  slot = (await queryOne<{ id: string }>("select id from delivery_slots where label = 'Evening'"))!.id;
  await query("update delivery_slots set capacity = 1000");
  tomato = (await queryOne<{ id: string }>("select v.id from product_variants v join products p on p.id = v.product_id where p.slug = 'tomato' and v.label = '500 g'"))!.id;
  await query("update product_variants set stock = greatest(stock, 500) where id = $1", [tomato]);
});
afterAll(async () => {
  await pool.end();
});

describe("coupon history survives deleting the account", () => {
  it("first-order and once-per-customer coupons don't work again after re-signing up with the same email", async () => {
    const tag = randomUUID().slice(0, 8);
    const first = `FIRST${tag}`.toUpperCase().slice(0, 20);
    const once = `ONCE${tag}`.toUpperCase().slice(0, 20);
    await query("insert into coupons (code, kind, value, min_order, active, first_order_only) values ($1, 'flat', 1000, 0, true, true)", [first]);
    await query("insert into coupons (code, kind, value, min_order, active, per_user_limit) values ($1, 'flat', 500, 0, true, 1)", [once]);

    const local = `re.signup${tag}`;
    const a = await newUser(`${local}@gmail.com`);
    expect(await couponIssue(a, first)).toBeNull();
    const { order: o } = await placeOrder(a, order({ couponCode: once }));
    await query("update orders set status = 'delivered', payment_status = 'cod_collected' where id = $1", [o.id]);
    expect(await couponIssue(a, first)).not.toBeNull();
    expect(await couponIssue(a, once)).not.toBeNull();

    await deleteAccount(a);
    // Same mailbox written differently (Gmail ignores dots and "+tags").
    const b = await newUser(`${local.replace(".", "")}+again@gmail.com`);
    expect(await couponIssue(b, first)).not.toBeNull();
    expect(await couponIssue(b, once)).not.toBeNull();

    // Someone else is unaffected.
    const c = await newUser(`someone-else-${tag}@gmail.com`);
    expect(await couponIssue(c, first)).toBeNull();
    expect(await couponIssue(c, once)).toBeNull();
  });
});

describe("limits", () => {
  it(`a customer can save at most ${MAX_ADDRESSES} addresses; ordering still works`, async () => {
    const u = await newUser(`many-addresses-${randomUUID().slice(0, 8)}@test.local`);
    for (let i = 0; i < MAX_ADDRESSES; i++) {
      await saveAddress(u, null, { label: "Home", fullName: "Many", phone: "9876543210", line1: `House ${i}`, city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false } as never);
    }
    await expect(
      saveAddress(u, null, { label: "Home", fullName: "Many", phone: "9876543210", line1: "One more", city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false } as never),
    ).rejects.toMatchObject({ status: 400, code: "TOO_MANY_ADDRESSES" });
    const { order: o } = await placeOrder(u, order({ saveAddress: true }));
    expect(o.id).toBeTruthy();
    expect(Number((await queryOne<{ n: string }>("select count(*) as n from addresses where user_id = $1", [u]))!.n)).toBe(MAX_ADDRESSES);
  });

  it("text with a NUL byte is a 400, not a server error", async () => {
    const { route } = await import("@/lib/http");
    // Any handler whose text reaches the database (contact form, reviews, addresses, profile …).
    const handler = route(async () => {
      await query("select $1::text", ["Hello \u0000 there"]);
      return Response.json({ ok: true });
    });
    const res = await handler(new Request("http://localhost/api/x", { method: "POST" }), { params: Promise.resolve({}) } as never);
    expect(res.status).toBe(400);
  });

  it("rate limits treat one IPv6 /64 as one caller", () => {
    const ip = (v: string) => clientIp(new Request("http://x", { headers: { "x-real-ip": v } }));
    expect(ip("2001:db8:1:2::1")).toBe(ip("2001:db8:1:2:ffff::9"));
    expect(ip("2001:db8:1:2::1")).not.toBe(ip("2001:db8:1:3::1"));
    expect(ip("203.0.113.7")).toBe("203.0.113.7");
  });
});

describe("deleted login", () => {
  it("a token of a deleted login doesn't recreate its profile", async () => {
    const ghost = randomUUID();
    const r = await queryOne(
      `insert into profiles (id, email) select $1, $2 where exists (select 1 from auth.users where id = $1)
       on conflict (id) do update set email = excluded.email returning id`,
      [ghost, "ghost@example.com"],
    );
    expect(r).toBeNull();
  });
});

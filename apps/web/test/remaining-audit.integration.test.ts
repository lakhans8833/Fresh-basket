/**
 * fix/remaining-audit-items (5 Nov 2026): regression tests written before each fix.
 * FB-33 late-payment revival must not turn a transient error into a permanent refund.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

vi.hoisted(() => {
  process.env.RAZORPAY_KEY_ID = "rzp_test_dummy";
  process.env.RAZORPAY_KEY_SECRET = "dummy_secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "dummy_webhook";
});

import { addDays, istDateString, type PlaceOrderInput } from "@freshbasket/shared";
import { pool, query, queryOne } from "@/lib/db";
import { getOrderById, placeOrder } from "@/lib/orders";

const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const tomorrow = addDays(istDateString(new Date()), 1);
let slot = "";
let tomato = "";

const input = (o: Partial<PlaceOrderInput> = {}): PlaceOrderInput =>
  ({
    items: [{ variantId: tomato, quantity: 4 }],
    address: { label: "Home", fullName: "Remaining Audit", phone: "9876543210", line1: `RA lane ${randomUUID().slice(0, 6)}`, city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false },
    saveAddress: false, slotId: slot, deliveryDate: tomorrow, paymentMethod: "razorpay", idempotencyKey: randomUUID(), couponCode: null, customerNote: null, ...o,
  }) as PlaceOrderInput;

async function expiredOrder() {
  const { order } = await placeOrder(CUSTOMER, input()).catch((e) => { throw new Error(JSON.stringify((e as { details?: unknown }).details)); });
  await query("update orders set reservation_expires_at = now() - interval '1 minute' where id = $1", [order.id]);
  await query("select release_expired_reservations()");
  expect((await getOrderById(order.id))!.status).toBe("cancelled");
  return order;
}

beforeAll(async () => {
  tomato = (await queryOne<{ id: string }>("select v.id from product_variants v join products p on p.id = v.product_id where p.slug = 'tomato' and v.label = '500 g'"))!.id;
  slot = (await queryOne<{ id: string }>("select id from delivery_slots where label = 'Evening'"))!.id;
  await query("update delivery_slots set capacity = 1000");
  await query("update products set stock_grams = greatest(stock_grams, 1000000) where slug = 'tomato'");
  // Test-only switch: a trigger that fails stock updates with a chosen SQLSTATE (simulates a deadlock etc.).
  await query(`create or replace function public.test_fail_stock() returns trigger language plpgsql as $$
    begin
      if current_setting('fb.test_fail_stock', true) is not null and current_setting('fb.test_fail_stock', true) <> '' then
        raise exception 'simulated transient failure' using errcode = current_setting('fb.test_fail_stock', true);
      end if;
      return new;
    end $$`);
  await query("drop trigger if exists test_fail_stock on public.products");
  await query("create trigger test_fail_stock before update of stock_grams on public.products for each row execute function public.test_fail_stock()");
});
afterAll(async () => {
  await query("drop trigger if exists test_fail_stock on public.products");
  await query("drop function if exists public.test_fail_stock()");
  await pool.end();
});

describe("FB-33 late payment: only 'revival blocked' becomes a refund", () => {
  for (const [name, code] of [["deadlock", "40P01"], ["lock not available", "55P03"], ["serialization failure", "40001"]] as const) {
    it(`a ${name} (${code}) is raised (so the webhook is retried), nothing is kept`, async () => {
      const order = await expiredOrder();
      const c = await pool.connect();
      try {
        await c.query("begin");
        await c.query("select set_config('fb.test_fail_stock', $1, true)", [code]);
        await expect(c.query("select mark_order_paid($1, 'razorpay', null, $2, $3, 'webhook') as r", [order.id, `pay_${randomUUID().slice(0, 10)}`, order.total])).rejects.toMatchObject({ code });
        await c.query("rollback");
      } finally {
        c.release();
      }
      const o = (await queryOne<{ status: string; payment_status: string }>("select status, payment_status from orders where id = $1", [order.id]))!;
      expect(o).toEqual({ status: "cancelled", payment_status: "failed" });
    });
  }

  it("a real blocker (item switched off) still ends as refund_required", async () => {
    const order = await expiredOrder();
    await query("update product_variants set active = false where id = $1", [tomato]);
    try {
      const r = await queryOne<{ r: string }>("select mark_order_paid($1, 'razorpay', null, $2, $3, 'webhook') as r", [order.id, `pay_${randomUUID().slice(0, 10)}`, order.total]);
      expect(r!.r).toBe("refund_required");
      expect((await queryOne<{ p: string }>("select payment_status as p from orders where id = $1", [order.id]))!.p).toBe("refund_pending");
    } finally {
      await query("update product_variants set active = true where id = $1", [tomato]);
    }
  });
});

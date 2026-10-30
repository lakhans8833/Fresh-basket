/**
 * Refunds and replacements after delivery (returns policy §3), 31 Oct 2026.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const who = vi.hoisted(() => ({ role: "admin" as "staff" | "admin" }));
vi.mock("@/lib/auth", () => ({
  requireStaff: async () => ({ userId: "00000000-0000-4000-8000-0000000000a1", profile: { role: who.role, email: null } }),
  getSession: async () => null,
}));

import { randomUUID } from "node:crypto";
import { addDays, istDateString, type Order, type PlaceOrderInput } from "@freshbasket/shared";
import { pool, query, queryOne } from "@/lib/db";
import { getMyOrder, placeOrder } from "@/lib/orders";
import { adminUpdateOrderStatus, adminUpdatePaymentStatus } from "@/lib/admin/orders";
import { POST } from "@/app/api/admin/orders/[id]/adjustments/route";
import { PATCH } from "@/app/api/admin/orders/[id]/adjustments/[adjId]/route";

const ADMIN = "00000000-0000-4000-8000-0000000000a1";
const CUSTOMER = "00000000-0000-4000-8000-0000000000c1";
const OTHER = "00000000-0000-4000-8000-0000000000c2";
const v: Record<string, string> = {};
let slot = "";

const input = (): PlaceOrderInput =>
  ({
    items: [{ variantId: v["onion:1 kg"]!, quantity: 4 }, { variantId: v["tomato:500 g"]!, quantity: 4 }],
    address: { label: "Home", fullName: "After Delivery", phone: "9876543210", line1: `AD lane ${randomUUID().slice(0, 6)}`, city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false },
    saveAddress: false, slotId: slot, deliveryDate: addDays(istDateString(new Date()), 1), paymentMethod: "cod", idempotencyKey: randomUUID(), couponCode: null, customerNote: null,
  }) as PlaceOrderInput;

const add = (id: string, body: unknown) =>
  POST(new Request(`http://x/api/admin/orders/${id}/adjustments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const done = (id: string, adjId: string) =>
  PATCH(new Request(`http://x/api/admin/orders/${id}/adjustments/${adjId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "done" }) }), { params: Promise.resolve({ id, adjId }) });
const body = async (r: Response) => (await r.json()) as { order: Order & { adjustments: Order["adjustments"] }; error?: string };

async function deliveredOrder(collect = true) {
  const { order } = await placeOrder(CUSTOMER, input());
  for (const s of ["packed", "out_for_delivery", "delivered"] as const) await adminUpdateOrderStatus(order.id, s, ADMIN);
  if (collect) await adminUpdatePaymentStatus(order.id, "cod_collected", ADMIN);
  return order;
}

beforeAll(async () => {
  for (const r of await query<{ id: string; slug: string; label: string }>("select v.id, p.slug, v.label from product_variants v join products p on p.id = v.product_id")) v[`${r.slug}:${r.label}`] = r.id;
  slot = (await queryOne<{ id: string }>("select id from delivery_slots where label = 'Evening'"))!.id;
  await query("update delivery_slots set capacity = 1000");
  await query("update product_variants set stock = greatest(stock, 300) where id = any($1::uuid[])", [[v["onion:1 kg"], v["tomato:500 g"]]]);
});
afterAll(async () => {
  await pool.end();
});

describe("after-delivery refunds and replacements", () => {
  it("admin records a refund for 2 squashed tomatoes; the customer sees it; then it's sent", async () => {
    who.role = "admin";
    const order = await deliveredOrder();
    const tomato = order.items.find((i) => i.variantId === v["tomato:500 g"])!;
    const r = await add(order.id, { kind: "refund", items: [{ itemId: tomato.id, quantity: 2 }], amount: tomato.unitPrice * 2, reason: "2 packs squashed (photo on WhatsApp)" });
    expect(r.status).toBe(201);
    const adj = (await body(r)).order.adjustments[0]!;
    expect(adj).toMatchObject({ kind: "refund", amount: tomato.unitPrice * 2, status: "pending", items: [{ itemId: tomato.id, quantity: 2 }] });

    const mine = await getMyOrder(CUSTOMER, order.id);
    expect(mine!.adjustments).toHaveLength(1);
    expect(await getMyOrder(OTHER, order.id)).toBeNull(); // other customers see nothing

    expect((await done(order.id, adj.id)).status).toBe(200);
    expect((await getMyOrder(CUSTOMER, order.id))!.adjustments[0]!.status).toBe("done");
    const notes = (await query<{ note: string }>("select note from order_events where order_id = $1 and note like 'Refund%'", [order.id])).map((e) => e.note);
    expect(notes).toHaveLength(2);
  });

  it("limits: no more than delivered, no more than the items' value, nothing before delivery or before payment", async () => {
    who.role = "admin";
    const order = await deliveredOrder();
    const onion = order.items.find((i) => i.variantId === v["onion:1 kg"])!;
    // More than the value of the chosen items.
    expect((await add(order.id, { kind: "refund", items: [{ itemId: onion.id, quantity: 1 }], amount: onion.unitPrice + 1, reason: "rotten" })).status).toBe(409);
    // Replacement of 3, then 2 more is more than the 4 delivered.
    expect((await add(order.id, { kind: "replacement", items: [{ itemId: onion.id, quantity: 3 }], amount: 0, reason: "rotten" })).status).toBe(201);
    expect((await add(order.id, { kind: "replacement", items: [{ itemId: onion.id, quantity: 2 }], amount: 0, reason: "rotten" })).status).toBe(409);
    // An item from another order.
    const other = await deliveredOrder();
    expect((await add(order.id, { kind: "replacement", items: [{ itemId: other.items[0]!.id, quantity: 1 }], amount: 0, reason: "x y z" })).status).toBe(409);
    // Not delivered yet.
    const { order: fresh } = await placeOrder(CUSTOMER, input());
    expect((await add(fresh.id, { kind: "replacement", items: [{ itemId: fresh.items[0]!.id, quantity: 1 }], amount: 0, reason: "missing" })).status).toBe(409);
    // Delivered but the cash not recorded yet: no refund (a replacement is fine).
    const unpaid = await deliveredOrder(false);
    expect((await add(unpaid.id, { kind: "refund", items: [{ itemId: unpaid.items[0]!.id, quantity: 1 }], amount: 100, reason: "missing" })).status).toBe(409);
    expect((await add(unpaid.id, { kind: "replacement", items: [{ itemId: unpaid.items[0]!.id, quantity: 1 }], amount: 0, reason: "missing" })).status).toBe(201);
    // Bad input.
    expect((await add(order.id, { kind: "refund", items: [{ itemId: onion.id, quantity: 1 }], amount: 0, reason: "rotten" })).status).toBe(400);
    expect((await add(order.id, { kind: "replacement", items: [], amount: 0, reason: "rotten" })).status).toBe(400);
  });

  it("staff can record and complete replacements, but not refunds", async () => {
    const order = await deliveredOrder();
    const it0 = order.items[0]!;
    who.role = "staff";
    expect((await add(order.id, { kind: "refund", items: [{ itemId: it0.id, quantity: 1 }], amount: 100, reason: "missing" })).status).toBe(403);
    const r = await add(order.id, { kind: "replacement", items: [{ itemId: it0.id, quantity: 1 }], amount: 0, reason: "missing" });
    expect(r.status).toBe(201);
    const rep = (await body(r)).order.adjustments[0]!;
    expect((await done(order.id, rep.id)).status).toBe(200);

    who.role = "admin";
    const ref = await body(await add(order.id, { kind: "refund", items: [{ itemId: it0.id, quantity: 1 }], amount: 100, reason: "another one" }));
    const refId = ref.order.adjustments.find((a) => a.kind === "refund")!.id;
    who.role = "staff";
    expect((await done(order.id, refId)).status).toBe(403);
    expect((await done(order.id, "not-a-uuid")).status).toBe(404);
  });

  it("customers can't write adjustments themselves (database rule)", async () => {
    const order = await deliveredOrder();
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: CUSTOMER, role: "authenticated" })]);
      await c.query("set local role authenticated");
      await expect(
        c.query("insert into order_adjustments (order_id, kind, items, amount, reason, created_by) values ($1, 'refund', '[{}]', 100, 'free money', 'me')", [order.id]),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await c.query("rollback");
      c.release();
    }
  });
});

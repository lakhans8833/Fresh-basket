/**
 * Self-service account deletion (needed for Google Play): open orders block it, staff can't delete
 * themselves, and a deletion removes the login + personal data while past orders stay (unlinked).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { addDays, istDateString, type PlaceOrderInput } from "@freshbasket/shared";
import { query, queryOne } from "@/lib/db";
import { deleteAccount, saveAddress } from "@/lib/account";
import { placeOrder } from "@/lib/orders";

const tomorrow = addDays(istDateString(new Date()), 1);
let slot = "";
let tomato = "";
let n = 0;
const order = (): PlaceOrderInput => ({
  items: [{ variantId: tomato, quantity: 4 }],
  address: { label: "Home", fullName: "Leaving Customer", phone: "9876543210", line1: `Gone Rd ${++n}`, city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: false },
  saveAddress: false, slotId: slot, deliveryDate: tomorrow, paymentMethod: "cod", idempotencyKey: randomUUID(), couponCode: null, customerNote: null,
} as PlaceOrderInput);

async function newUser(email: string) {
  return (await queryOne<{ id: string }>("insert into auth.users (email, email_confirmed_at) values ($1, now()) returning id", [email]))!.id;
}

beforeAll(async () => {
  slot = (await queryOne<{ id: string }>("select id from delivery_slots where label = 'Evening'"))!.id;
  await query("update delivery_slots set capacity = 1000");
  tomato = (await queryOne<{ id: string }>("select v.id from product_variants v join products p on p.id = v.product_id where p.slug = 'tomato' and v.label = '500 g'"))!.id;
});

describe("deleteAccount", () => {
  it("is refused while an order is still open, and works once it's delivered", async () => {
    const id = await newUser(`leaving-${randomUUID()}@test.local`);
    const { order: o } = await placeOrder(id, order());
    await expect(deleteAccount(id)).rejects.toMatchObject({ status: 409, code: "OPEN_ORDERS" });
    expect(await queryOne("select 1 from auth.users where id = $1", [id])).not.toBeNull();

    await query("update orders set status = 'delivered', payment_status = 'cod_collected' where id = $1", [o.id]);
    await saveAddress(id, null, { label: "Home", fullName: "Leaving Customer", phone: "9876543210", line1: "Saved Rd 1", city: "Bengaluru", state: "Karnataka", pincode: "560034", isDefault: true } as never);
    const r = await deleteAccount(id);
    expect(r.ordersKept).toBe(1);
    expect(await queryOne("select 1 from auth.users where id = $1", [id])).toBeNull();
    expect(await queryOne("select 1 from profiles where id = $1", [id])).toBeNull();
    expect(await queryOne("select 1 from addresses where user_id = $1", [id])).toBeNull();
    // The order stays for the store's records, no longer linked to anyone.
    const kept = await queryOne<{ user_id: string | null; total: number }>("select user_id, total from orders where id = $1", [o.id]);
    expect(kept).toMatchObject({ user_id: null });
  });

  it("refuses staff and admin accounts", async () => {
    const id = await newUser(`staffer-${randomUUID()}@test.local`);
    await query("update profiles set role = 'staff' where id = $1", [id]);
    await expect(deleteAccount(id)).rejects.toMatchObject({ status: 403 });
    expect(await queryOne("select 1 from auth.users where id = $1", [id])).not.toBeNull();
  });

  it("deletes an account that never ordered", async () => {
    const id = await newUser(`browser-${randomUUID()}@test.local`);
    await expect(deleteAccount(id)).resolves.toEqual({ ordersKept: 0 });
    expect(await queryOne("select 1 from profiles where id = $1", [id])).toBeNull();
  });
});

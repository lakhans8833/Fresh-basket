import "server-only";
import { emailIdentity } from "./account-identity";
import type { Address, AddressInput } from "@freshbasket/shared";
import { asUser, tx } from "./db";
import { conflict, forbidden, HttpError, notFound } from "./http";
import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

type Row = {
  id: string; label: string; full_name: string; phone: string; line1: string; line2: string | null; landmark: string | null;
  city: string; state: string; pincode: string; is_default: boolean;
};
const toAddress = (r: Row): Address => ({
  id: r.id, label: r.label, fullName: r.full_name, phone: r.phone, line1: r.line1, line2: r.line2, landmark: r.landmark,
  city: r.city, state: r.state, pincode: r.pincode, isDefault: r.is_default,
});

// All address operations run with RLS as the customer: the database itself prevents
// reading or changing another customer's addresses.
export const listAddresses = (userId: string) =>
  asUser(userId, async (c) => (await c.query<Row>("select * from addresses where user_id = auth.uid() order by is_default desc, created_at")).rows.map(toAddress));

/** Most saved addresses per customer (stops one account filling the database). */
export const MAX_ADDRESSES = 20;

export async function saveAddress(userId: string, id: string | null, a: AddressInput): Promise<Address> {
  return asUser(userId, async (c) => {
    const { rows: cnt } = await c.query<{ n: string }>("select count(*) as n from addresses where user_id = auth.uid()");
    if (!id && Number(cnt[0]?.n ?? 0) >= MAX_ADDRESSES) {
      throw new HttpError(400, `You can save up to ${MAX_ADDRESSES} addresses. Delete one you no longer use to add another.`, "TOO_MANY_ADDRESSES");
    }
    const makeDefault = a.isDefault || Number(cnt[0]?.n ?? 0) === 0;
    if (makeDefault) await c.query("update addresses set is_default = false where user_id = auth.uid() and is_default and ($1::uuid is null or id <> $1)", [id]);
    const p = [a.label, a.fullName, a.phone, a.line1, a.line2 ?? null, a.landmark ?? null, a.city, a.state, a.pincode, makeDefault];
    const { rows } = id
      ? await c.query<Row>(
          `update addresses set label=$1, full_name=$2, phone=$3, line1=$4, line2=$5, landmark=$6, city=$7, state=$8, pincode=$9,
                  is_default = case when $10 then true else is_default end where id = $11 and user_id = auth.uid() returning *`,
          [...p, id],
        )
      : await c.query<Row>(
          `insert into addresses (user_id, label, full_name, phone, line1, line2, landmark, city, state, pincode, is_default)
           values (auth.uid(), $1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
          p,
        );
    if (!rows[0]) throw notFound("Address not found.");
    return toAddress(rows[0]);
  });
}

export async function deleteAddress(userId: string, id: string) {
  return asUser(userId, async (c) => {
    const { rows } = await c.query<Row>("delete from addresses where id = $1 and user_id = auth.uid() returning *", [id]);
    if (!rows[0]) throw notFound("Address not found.");
    if (rows[0].is_default) {
      await c.query("update addresses set is_default = true where id = (select id from addresses where user_id = auth.uid() order by created_at limit 1)");
    }
  });
}

export async function updateProfile(userId: string, d: { fullName: string; phone?: string | null }) {
  return asUser(userId, async (c) => {
    await c.query("update profiles set full_name = $1, phone = $2 where id = auth.uid()", [d.fullName, d.phone ?? null]);
  });
}

/** Orders that are still being handled: the account can't be deleted until they're finished. */
const OPEN_ORDER_SQL = `user_id = $1 and (status in ('pending_payment','pending_confirmation','placed','packed','out_for_delivery') or payment_status = 'refund_pending')`;

/**
 * Self-service account deletion (Google Play requires it for apps with accounts).
 * Deletes the login (auth.users) and, through it, the profile, saved addresses, reviews and coupon
 * history. Past orders are kept for the store's accounts but no longer linked to anyone; support
 * messages lose their link too. Refused while an order is still open, and for staff/admin accounts
 * (so the store can't lose its last admin by accident).
 */
export async function deleteAccount(userId: string): Promise<{ ordersKept: number }> {
  const r = await tx(async (c) => {
    const p = await c.query<{ role: string }>("select role from public.profiles where id = $1 for update", [userId]);
    if (p.rows[0] && p.rows[0].role !== "customer") throw forbidden("Staff and admin accounts can't be deleted here. Ask the store owner to remove your access first.");
    const open = await c.query<{ order_number: string }>(`select order_number from public.orders where ${OPEN_ORDER_SQL} order by created_at`, [userId]);
    if (open.rows.length) {
      throw conflict(`You have an order in progress (${open.rows.map((r) => r.order_number).join(", ")}). You can delete your account once it's delivered or cancelled.`, undefined, "OPEN_ORDERS");
    }
    // Coupon history that must outlive the account (first-order and per-customer coupons), keyed by a
    // hash of the email — so deleting the account and signing up again doesn't reset them.
    const who = await c.query<{ email: string | null }>(
      "select coalesce((select email from auth.users where id = $1), (select email from public.profiles where id = $1)) as email",
      [userId],
    );
    const identity = emailIdentity(who.rows[0]?.email);
    if (identity) {
      await c.query(
        `insert into public.deleted_account_identities (identity, had_orders, coupon_uses)
         select $2,
                exists (select 1 from public.orders where user_id = $1 and status <> 'cancelled'),
                coalesce((select jsonb_object_agg(coupon_id::text, n) from (select coupon_id, count(*)::int n from public.coupon_redemptions where user_id = $1 group by coupon_id) x), '{}'::jsonb)
         on conflict (identity) do update set
           had_orders = deleted_account_identities.had_orders or excluded.had_orders,
           coupon_uses = (select coalesce(jsonb_object_agg(k, (coalesce((deleted_account_identities.coupon_uses->>k)::int, 0) + coalesce((excluded.coupon_uses->>k)::int, 0))), '{}'::jsonb)
                            from (select jsonb_object_keys(deleted_account_identities.coupon_uses) k union select jsonb_object_keys(excluded.coupon_uses)) keys),
           deleted_at = now()`,
        [userId, identity],
      );
    }
    const detached = await c.query<{ id: string }>("update public.orders set user_id = null where user_id = $1 returning id", [userId]);
    const orderIds = detached.rows.map((o) => o.id);
    // Deleting the login cascades to the profile, addresses, reviews and coupon history.
    await c.query("savepoint del_user");
    try {
      await c.query("delete from auth.users where id = $1", [userId]);
      return { orderIds, viaAdminApi: false };
    } catch (e) {
      // A database role without rights on auth.users (some Supabase setups): the Auth admin API does it
      // after this transaction (it can't wait on rows this transaction has locked).
      if ((e as { code?: string }).code !== "42501" || env.auth.mode !== "supabase" || !env.storage.serviceRoleKey) throw e;
      await c.query("rollback to savepoint del_user");
      return { orderIds, viaAdminApi: true };
    }
  });
  if (r.viaAdminApi) {
    const sb = createClient(env.auth.supabaseUrl!, env.storage.serviceRoleKey!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await sb.auth.admin.deleteUser(userId);
    if (error) {
      // Nothing was deleted: give the orders back to the account.
      await tx((c) => c.query("update public.orders set user_id = $1 where id = any($2::uuid[]) and user_id is null", [userId, r.orderIds]));
      throw new HttpError(502, "Your account couldn't be deleted right now. Please try again in a minute.");
    }
  }
  return { ordersKept: r.orderIds.length };
}

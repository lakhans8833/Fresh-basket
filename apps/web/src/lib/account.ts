import "server-only";
import type { Address, AddressInput } from "@freshbasket/shared";
import { asUser } from "./db";
import { notFound } from "./http";

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
  asUser(userId, async (c) => (await c.query<Row>("select * from addresses order by is_default desc, created_at")).rows.map(toAddress));

export async function saveAddress(userId: string, id: string | null, a: AddressInput): Promise<Address> {
  return asUser(userId, async (c) => {
    const { rows: cnt } = await c.query<{ n: string }>("select count(*) as n from addresses");
    const makeDefault = a.isDefault || Number(cnt[0]?.n ?? 0) === 0;
    if (makeDefault) await c.query("update addresses set is_default = false where is_default and ($1::uuid is null or id <> $1)", [id]);
    const p = [a.label, a.fullName, a.phone, a.line1, a.line2 ?? null, a.landmark ?? null, a.city, a.state, a.pincode, makeDefault];
    const { rows } = id
      ? await c.query<Row>(
          `update addresses set label=$1, full_name=$2, phone=$3, line1=$4, line2=$5, landmark=$6, city=$7, state=$8, pincode=$9,
                  is_default = case when $10 then true else is_default end where id = $11 returning *`,
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
    const { rows } = await c.query<Row>("delete from addresses where id = $1 returning *", [id]);
    if (!rows[0]) throw notFound("Address not found.");
    if (rows[0].is_default) {
      await c.query("update addresses set is_default = true where id = (select id from addresses order by created_at limit 1)");
    }
  });
}

export async function updateProfile(userId: string, d: { fullName: string; phone?: string | null }) {
  return asUser(userId, async (c) => {
    await c.query("update profiles set full_name = $1, phone = $2 where id = auth.uid()", [d.fullName, d.phone ?? null]);
  });
}

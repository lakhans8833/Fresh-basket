import "server-only";
import type { z } from "zod";
import type { adminCouponSchema, adminDeliveryAreaSchema, adminSettingsSchema, adminSlotSchema } from "@freshbasket/shared";
import { query, queryOne } from "../db";
import { notFound } from "../http";

/* Delivery areas */
export const adminListAreas = () =>
  query(`select id, pincode, area_name as "areaName", city, fee, free_above as "freeAbove", min_order as "minOrder", active from delivery_areas order by city, pincode`);

export async function adminSaveArea(id: string | null, d: z.output<typeof adminDeliveryAreaSchema>) {
  const p = [d.pincode, d.areaName, d.city, d.fee, d.freeAbove ?? null, d.minOrder, d.active];
  if (id) {
    const r = await queryOne("update delivery_areas set pincode=$1, area_name=$2, city=$3, fee=$4, free_above=$5, min_order=$6, active=$7 where id=$8 returning id", [...p, id]);
    if (!r) throw notFound();
    return r;
  }
  return queryOne("insert into delivery_areas (pincode, area_name, city, fee, free_above, min_order, active) values ($1,$2,$3,$4,$5,$6,$7) returning id", p);
}
export const adminDeleteArea = (id: string) => query("delete from delivery_areas where id = $1", [id]);

/* Slots */
export const adminListSlots = () =>
  query(`select id, label, to_char(start_time,'HH24:MI') as "startTime", to_char(end_time,'HH24:MI') as "endTime", cutoff_minutes as "cutoffMinutes",
                capacity, sort_order as "sortOrder", active from delivery_slots order by sort_order, start_time`);

export async function adminSaveSlot(id: string | null, d: z.output<typeof adminSlotSchema>) {
  const p = [d.label, d.startTime, d.endTime, d.cutoffMinutes, d.capacity, d.sortOrder, d.active];
  if (id) {
    const r = await queryOne("update delivery_slots set label=$1, start_time=$2, end_time=$3, cutoff_minutes=$4, capacity=$5, sort_order=$6, active=$7 where id=$8 returning id", [...p, id]);
    if (!r) throw notFound();
    return r;
  }
  return queryOne("insert into delivery_slots (label, start_time, end_time, cutoff_minutes, capacity, sort_order, active) values ($1,$2,$3,$4,$5,$6,$7) returning id", p);
}
/** Slots referenced by orders are kept (orders store a label snapshot); we just deactivate. */
export async function adminDeleteSlot(id: string) {
  const r = await queryOne<{ n: number }>("select count(*)::int as n from orders where slot_id = $1", [id]);
  if ((r?.n ?? 0) > 0) return query("update delivery_slots set active = false where id = $1", [id]);
  return query("delete from delivery_slots where id = $1", [id]);
}

/* Coupons */
export const adminListCoupons = () =>
  query(`select id, code, description, kind, value, min_order as "minOrder", max_discount as "maxDiscount", starts_at as "startsAt",
                ends_at as "endsAt", usage_limit as "usageLimit", per_user_limit as "perUserLimit", first_order_only as "firstOrderOnly", used_count as "usedCount", active
           from coupons order by created_at desc`);

export async function adminSaveCoupon(id: string | null, d: z.output<typeof adminCouponSchema>) {
  const p = [d.code, d.description ?? null, d.kind, d.value, d.minOrder, d.maxDiscount ?? null, d.startsAt || null, d.endsAt || null, d.usageLimit ?? null, d.perUserLimit ?? null, d.active, d.firstOrderOnly ?? false];
  if (id) {
    const r = await queryOne(
      "update coupons set code=$1, description=$2, kind=$3, value=$4, min_order=$5, max_discount=$6, starts_at=$7, ends_at=$8, usage_limit=$9, per_user_limit=$10, active=$11, first_order_only=$12 where id=$13 returning id",
      [...p, id],
    );
    if (!r) throw notFound();
    return r;
  }
  return queryOne(
    "insert into coupons (code, description, kind, value, min_order, max_discount, starts_at, ends_at, usage_limit, per_user_limit, active, first_order_only) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id",
    p,
  );
}
export async function adminDeleteCoupon(id: string) {
  const r = await queryOne<{ n: number }>("select count(*)::int as n from orders where coupon_id = $1", [id]);
  if ((r?.n ?? 0) > 0) return query("update coupons set active = false where id = $1", [id]);
  return query("delete from coupons where id = $1", [id]);
}

/* Settings */
export async function adminSaveSettings(d: z.output<typeof adminSettingsSchema>) {
  await query(
    `insert into store_settings (id, store_name, tagline, logo_url, support_phone, support_email, whatsapp, address, support_hours,
        instagram_url, facebook_url, youtube_url, x_url, cod_enabled, default_min_order, slot_days_ahead, announcement)
     values (true,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     on conflict (id) do update set store_name=excluded.store_name, tagline=excluded.tagline, logo_url=excluded.logo_url,
        support_phone=excluded.support_phone, support_email=excluded.support_email, whatsapp=excluded.whatsapp, address=excluded.address,
        support_hours=excluded.support_hours, instagram_url=excluded.instagram_url, facebook_url=excluded.facebook_url,
        youtube_url=excluded.youtube_url, x_url=excluded.x_url, cod_enabled=excluded.cod_enabled,
        default_min_order=excluded.default_min_order, slot_days_ahead=excluded.slot_days_ahead, announcement=excluded.announcement`,
    [
      d.storeName, d.tagline, d.logoUrl || null, d.supportPhone || null, d.supportEmail || null, d.whatsapp || null, d.address || null,
      d.supportHours || null, d.instagram, d.facebook, d.youtube, d.x, d.codEnabled, d.defaultMinOrder, d.slotDaysAhead, d.announcement || null,
    ],
  );
  // UPI details: only touched when the request includes them (older admin screens don't send them).
  const upi: [string, string | null | undefined][] = [["upi_id", d.upiId], ["upi_payee_name", d.upiPayeeName], ["upi_qr_url", d.upiQrUrl]];
  for (const [col, val] of upi) {
    if (val === undefined) continue;
    await query(`update store_settings set ${col} = $1 where id`, [val?.trim() ? val.trim() : null]);
  }
}

/* Messages & subscribers */
export const adminListMessages = () =>
  query(`select id, name, email, phone, order_number as "orderNumber", message, status, created_at as "createdAt" from support_messages order by created_at desc limit 200`);
export const adminSetMessageStatus = (id: string, status: "open" | "closed") =>
  query("update support_messages set status = $2 where id = $1", [id, status]);
export const adminSubscriberCount = async () => (await queryOne<{ n: number }>("select count(*)::int as n from newsletter_subscribers"))?.n ?? 0;

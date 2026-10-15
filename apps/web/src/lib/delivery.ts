import "server-only";
import { CACHE_TAGS, cached } from "./cache";
import type { PoolClient } from "pg";
import { addDays, isSlotBookable, istDateString, type DeliveryArea, type SlotOption, type SlotRule } from "@freshbasket/shared";
import { pool, query, queryOne } from "./db";

type Q = Pick<PoolClient, "query">;

type AreaRow = { id: string; pincode: string; area_name: string; city: string; fee: number; free_above: number | null; min_order: number; active: boolean };
export const toArea = (r: AreaRow): DeliveryArea => ({
  id: r.id, pincode: r.pincode, areaName: r.area_name, city: r.city, fee: r.fee, freeAbove: r.free_above, minOrder: r.min_order, active: r.active,
});

export async function getArea(pincode: string, db: Q = pool): Promise<DeliveryArea | null> {
  const { rows } = await db.query<AreaRow>("select * from delivery_areas where pincode = $1 and active", [pincode]);
  return rows[0] ? toArea(rows[0]) : null;
}

type SlotRow = { id: string; label: string; start_time: string; end_time: string; cutoff_minutes: number; capacity: number; active: boolean };
export const toSlotRule = (r: SlotRow): SlotRule => ({
  id: r.id, label: r.label, startTime: r.start_time.slice(0, 5), endTime: r.end_time.slice(0, 5),
  cutoffMinutes: r.cutoff_minutes, capacity: r.capacity, active: r.active,
});

export async function getSlotOptions(daysAhead: number, now = new Date()): Promise<SlotOption[]> {
  const slots = (await query<SlotRow>("select * from delivery_slots where active order by sort_order, start_time")).map(toSlotRule);
  const today = istDateString(now);
  const dates = Array.from({ length: daysAhead }, (_, i) => addDays(today, i));
  const counts = await query<{ delivery_date: string; slot_id: string; n: string }>(
    `select to_char(delivery_date, 'YYYY-MM-DD') as delivery_date, slot_id, count(*) as n from (
        select delivery_date, slot_id from orders where status <> 'cancelled' and delivery_date between $1::date and $2::date
        union all
        select delivery_date, slot_id from whatsapp_bookings where status <> 'cancelled' and delivery_date between $1::date and $2::date
      ) x group by 1, 2`,
    [dates[0], dates[dates.length - 1]],
  );
  const booked = new Map(counts.map((c) => [`${c.delivery_date}|${c.slot_id}`, Number(c.n)]));
  return dates.flatMap((date) =>
    slots.map((s) => ({
      slotId: s.id, date, label: s.label, startTime: s.startTime, endTime: s.endTime,
      available: isSlotBookable(s, date, now, booked.get(`${date}|${s.id}`) ?? 0),
    })),
  );
}

/** Lock the slot row and check it's still bookable for the date (serialises capacity checks). */
export async function lockAndCheckSlot(db: Q, slotId: string, date: string, now = new Date()) {
  const { rows } = await db.query<SlotRow>("select * from delivery_slots where id = $1 for update", [slotId]);
  if (!rows[0]) return { ok: false as const, reason: "This delivery slot is no longer offered." };
  const rule = toSlotRule(rows[0]);
  const { rows: c } = await db.query<{ n: string }>(
    `select (select count(*) from orders where slot_id = $1 and delivery_date = $2 and status <> 'cancelled')
          + (select count(*) from whatsapp_bookings where slot_id = $1 and delivery_date = $2 and status <> 'cancelled') as n`,
    [slotId, date],
  );
  if (!isSlotBookable(rule, date, now, Number(c[0]?.n ?? 0))) {
    return { ok: false as const, reason: "That delivery slot is full or closed. Please pick another." };
  }
  return { ok: true as const, rule };
}

export async function getDefaultMinOrder(db: Q = pool) {
  const { rows } = await db.query<{ default_min_order: number }>("select default_min_order from store_settings where id");
  return rows[0]?.default_min_order ?? 0;
}


/** Active delivery areas, for the public delivery policy page. */
export async function listActiveDeliveryAreas(): Promise<DeliveryArea[]> {
  return (await query<AreaRow>("select * from delivery_areas where active order by city, area_name, pincode")).map(toArea);
}

/** Active delivery slot rules, for the public delivery policy page. */
export async function listActiveSlots(): Promise<SlotRule[]> {
  return (await query<SlotRow>("select * from delivery_slots where active order by sort_order, start_time")).map(toSlotRule);
}

export { queryOne };

/**
 * The free-delivery amount when every active delivery area uses the same one (so the cart can show
 * "Add ₹X more for FREE delivery" before a PIN code is chosen). null when areas differ or none has it.
 * Cached with the catalogue (Admin → Delivery saves drop it).
 */
export const commonFreeAbove = cached("common-free-above-v1", [CACHE_TAGS.catalog], 300, async (): Promise<number | null> => {
  const rows = await query<{ v: number | null; n: number }>(
    "select free_above as v, count(*)::int as n from delivery_areas where active group by free_above",
  );
  return rows.length === 1 && rows[0]!.v !== null ? rows[0]!.v : null;
});

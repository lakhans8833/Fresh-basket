/** Delivery slot helpers. All business times are in India Standard Time (UTC+05:30). */
export const IST_OFFSET_MINUTES = 330;

/** YYYY-MM-DD for the given instant in IST. */
export function istDateString(d: Date): string {
  const ist = new Date(d.getTime() + IST_OFFSET_MINUTES * 60_000);
  return ist.toISOString().slice(0, 10);
}

/** The UTC instant of a HH:MM[:SS] time on an IST calendar date. */
export function istInstant(date: string, time: string): Date {
  const [h = "0", m = "0"] = time.split(":");
  const utc = Date.parse(`${date}T00:00:00Z`) + (Number(h) * 60 + Number(m) - IST_OFFSET_MINUTES) * 60_000;
  return new Date(utc);
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export interface SlotRule {
  id: string;
  label: string;
  startTime: string; // "07:00"
  endTime: string;
  cutoffMinutes: number; // orders close this many minutes before slot start
  capacity: number;
  active: boolean;
}

export function isSlotBookable(slot: SlotRule, date: string, now: Date, booked: number): boolean {
  if (!slot.active) return false;
  if (booked >= slot.capacity) return false;
  const closesAt = istInstant(date, slot.startTime).getTime() - slot.cutoffMinutes * 60_000;
  return now.getTime() < closesAt;
}

export function formatSlotTime(t: string): string {
  const [hs = "0", ms = "0"] = t.split(":");
  const h = Number(hs);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return ms === "00" ? `${h12} ${suffix}` : `${h12}:${ms} ${suffix}`;
}

/** "Afternoon, 12:00–15:00" (as stored on an order) → "Afternoon, 12 PM–3 PM", as the website shows it. */
export function formatSlotLabel(label: string): string {
  return label.replace(/(\d{2}:\d{2})/g, (t) => formatSlotTime(t));
}

import { useEffect, useState } from "react";
import { addDays, formatSlotTime, istDateString } from "@shared/slots";
import type { SlotOption } from "@shared/types";
import { api } from "./api";

let cached: Promise<SlotOption[]> | null = null;
const loadSlots = () =>
  (cached ??= api<{ slots: SlotOption[] }>("/api/delivery/slots", { auth: false })
    .then((r) => r.slots)
    .catch(() => {
      cached = null;
      return [];
    }));

function dayWord(date: string) {
  const today = istDateString(new Date());
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return new Date(`${date}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/** "5 PM–8 PM" → "5–8 PM" when both ends share AM/PM. */
function range(start: string, end: string) {
  const a = formatSlotTime(start);
  const b = formatSlotTime(end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

/** "Today, 12–3 PM": the first delivery slot that can still be booked (same as the website header). */
export function useNextSlotLabel() {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadSlots().then((s) => {
      const x = s.find((y) => y.available);
      if (live) setLabel(x ? `${dayWord(x.date)}, ${range(x.startTime, x.endTime)}` : null);
    });
    return () => {
      live = false;
    };
  }, []);
  return label;
}

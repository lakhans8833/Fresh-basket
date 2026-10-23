"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { formatSlotTime, istDateString, addDays, type SlotOption } from "@freshbasket/shared";
import { api } from "@/lib/client/api";

let cached: Promise<SlotOption[]> | null = null;
const loadSlots = () => (cached ??= api<{ slots: SlotOption[] }>("/api/delivery/slots").then((r) => r.slots).catch(() => { cached = null; return []; }));

function dayWord(date: string) {
  const today = istDateString(new Date());
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return new Date(`${date}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

/** "5 PM–8 PM" → "5–8 PM" when both ends share AM/PM. */
function range(start: string, end: string) {
  const a = formatSlotTime(start), b = formatSlotTime(end);
  const [am, bm] = [a.slice(-2), b.slice(-2)];
  return am === bm ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

/** "Next delivery: Today, 5–8 PM" — the first slot that can still be booked (like a quick-commerce ETA, but honest for slots). */
export function NextSlot({ className }: { className?: string }) {
  const [slot, setSlot] = useState<SlotOption | null>(null);
  useEffect(() => {
    let live = true;
    void loadSlots().then((s) => live && setSlot(s.find((x) => x.available) ?? null));
    return () => { live = false; };
  }, []);
  if (!slot) return null;
  return (
    <p className={className}>
      <Clock className="size-4 shrink-0 text-lime-300" aria-hidden />
      <span className="truncate">
        <span className="hidden sm:inline">Next delivery: </span>
        <span className="sr-only sm:hidden">Next delivery: </span>
        <b className="font-semibold">{dayWord(slot.date)}, {range(slot.startTime, slot.endTime)}</b>
      </span>
    </p>
  );
}

"use client";

import { formatSlotTime, type SlotOption } from "@freshbasket/shared";
import { cn } from "../ui/cn";

export function dayLabel(date: string, today: string) {
  const d = new Date(`${date}T00:00:00+05:30`);
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const name = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });
  return { name, date: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) };
}

/** Delivery date tabs + time slot radios (slots come from /api/delivery/slots). */
export function SlotPicker({
  slots, date, slotId, onChange,
}: { slots: SlotOption[]; date: string | null; slotId: string | null; onChange: (date: string, slotId: string | null) => void }) {
  const dates = [...new Set(slots.map((s) => s.date))];
  const today = dates[0] ?? "";
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Delivery date" className="no-scrollbar flex gap-2 overflow-x-auto">
        {dates.map((d) => {
          const l = dayLabel(d, today);
          const any = slots.some((s) => s.date === d && s.available);
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={date === d}
              onClick={() => onChange(d, slots.find((s) => s.date === d && s.available)?.slotId ?? null)}
              className={cn("flex min-w-24 shrink-0 flex-col items-center rounded-2xl border px-4 py-2.5 text-sm", date === d ? "border-forest-800 bg-forest-800 text-white" : "border-line bg-white text-ink-soft hover:border-forest-700/30", !any && "opacity-60")}
            >
              <span className="font-semibold">{l.name}</span>
              <span className={cn("text-xs", date === d ? "text-white/75" : "text-muted")}>{l.date}</span>
            </button>
          );
        })}
      </div>
      <div role="radiogroup" aria-label="Time slot" className="grid gap-2.5 sm:grid-cols-3">
        {slots.filter((s) => s.date === date).map((s) => (
          <label key={s.slotId} className={cn("rounded-2xl border-2 p-3.5 text-sm transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lime-200", !s.available ? "cursor-not-allowed border-line bg-sage-50 text-muted" : slotId === s.slotId ? "cursor-pointer border-leaf-500 bg-lime-50" : "cursor-pointer border-line hover:border-forest-700/30")}>
            <input type="radio" name="slot" className="sr-only" disabled={!s.available} checked={slotId === s.slotId} onChange={() => onChange(s.date, s.slotId)} />
            <span className="block font-semibold text-ink">{s.label}</span>
            <span className="block tabular-nums text-ink-soft">{formatSlotTime(s.startTime)} – {formatSlotTime(s.endTime)}</span>
            {!s.available ? <span className="text-xs">Closed or full</span> : null}
          </label>
        ))}
      </div>
      {date && !slots.some((s) => s.date === date && s.available) ? <p className="text-sm text-muted">No slots left on this day — try another date.</p> : null}
    </div>
  );
}

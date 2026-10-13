"use client";

import { Minus, Plus } from "lucide-react";
import { MAX_QTY_PER_LINE } from "@freshbasket/shared";
import { cn } from "../ui/cn";

export function QuantityStepper({
  value, onChange, max = MAX_QTY_PER_LINE, label, size = "md", tone = "lime",
}: { value: number; onChange: (n: number) => void; max?: number; label: string; size?: "sm" | "md"; tone?: "lime" | "outline" }) {
  const h = size === "sm" ? "h-9" : "h-11";
  const btn = size === "sm" ? "size-9" : "size-11";
  return (
    <div
      role="group"
      aria-label={`Quantity for ${label}`}
      className={cn("inline-flex items-center rounded-full", h, tone === "lime" ? "bg-lime-200 text-forest-900" : "border border-line bg-white text-forest-900")}
    >
      <button type="button" aria-label={value <= 1 ? `Remove ${label}` : `Decrease ${label}`} onClick={() => onChange(value - 1)} className={cn("grid place-items-center rounded-full hover:bg-black/5", btn)}>
        <Minus className="size-4" />
      </button>
      <span className="min-w-6 text-center text-sm font-bold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={cn("grid place-items-center rounded-full hover:bg-black/5 disabled:opacity-40", btn)}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

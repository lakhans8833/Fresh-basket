"use client";

import { Minus, Plus } from "lucide-react";
import { MAX_QTY_PER_LINE } from "@freshbasket/shared";
import { cn } from "../ui/cn";

export function QuantityStepper({
  value, onChange, max = MAX_QTY_PER_LINE, label, size = "md", tone = "lime", className,
}: { value: number; onChange: (n: number) => void; max?: number; label: string; size?: "sm" | "md"; tone?: "lime" | "outline" | "solid"; className?: string }) {
  const h = size === "sm" ? "h-9" : "h-11";
  const btn = size === "sm" ? "size-9" : "size-11";
  return (
    <div
      role="group"
      aria-label={`Quantity for ${label}`}
      className={cn(
        "inline-flex items-center justify-between",
        tone === "solid" ? "rounded-lg bg-leaf-600 text-white" : "rounded-full",
        h,
        tone === "lime" ? "bg-lime-200 text-forest-900" : tone === "outline" ? "border border-line bg-white text-forest-900" : null,
        className,
      )}
    >
      <button type="button" aria-label={value <= 1 ? `Remove ${label}` : `Decrease ${label}`} onClick={() => onChange(value - 1)} className={cn("grid place-items-center hover:bg-black/10", tone === "solid" ? "rounded-lg" : "rounded-full", btn)}>
        <Minus className="size-4" />
      </button>
      <span className="min-w-8 text-center text-sm font-bold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className={cn("grid place-items-center hover:bg-black/10 disabled:opacity-40", tone === "solid" ? "rounded-lg" : "rounded-full", btn)}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { formatINR, unitPriceLabel, type ProductSummary } from "@freshbasket/shared";
import { percentOff } from "../ui/price";
import { cn } from "../ui/cn";

type Variant = ProductSummary["variants"][number];

/**
 * Pack-size dropdown (500 g / 1 kg …). Each option shows its own price, MRP and % off,
 * all taken from the weight options entered in Admin → Products.
 * With a single option it renders as a plain label.
 */
export function PackSizeSelect({
  product, value, onChange, className,
}: { product: ProductSummary; value: string; onChange: (id: string) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const variants = product.variants;
  const selected = variants.find((v) => v.id === value) ?? variants[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    listRef.current?.focus();
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  if (!selected) return null;

  if (variants.length <= 1) {
    return (
      <p className={cn("relative z-10 flex h-9 items-center rounded-lg bg-sage-50 px-3 text-sm text-ink-soft", className)}>
        {selected.label}
      </p>
    );
  }

  function openList() {
    setActive(Math.max(0, variants.findIndex((v) => v.id === selected!.id)));
    setOpen(true);
  }
  function choose(v: Variant) {
    onChange(v.id);
    setOpen(false);
    btnRef.current?.focus();
  }
  function onListKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(variants.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(variants.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(variants[active]!); }
    else if (e.key === "Escape" || e.key === "Tab") { setOpen(false); if (e.key === "Escape") btnRef.current?.focus(); }
  }

  return (
    <div ref={rootRef} className={cn("relative z-10", open && "z-30", className)}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Pack size for ${product.name}: ${selected.label}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); openList(); } }}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border px-3 text-left text-sm font-medium transition-colors",
          open ? "border-forest-900 bg-forest-900 text-white" : "border-forest-800/30 bg-lime-50 text-ink hover:border-forest-800",
        )}
      >
        <span className="truncate">{selected.label}</span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={`Pack sizes for ${product.name}`}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKey}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 min-w-[13rem] space-y-1.5 overflow-y-auto rounded-xl border border-line bg-white p-2 shadow-[var(--shadow-lift)] outline-none"
        >
          {variants.map((v, i) => {
            const pct = percentOff(v.price, v.mrp);
            const isSel = v.id === selected.id;
            const out = v.stock <= 0;
            return (
              <li
                key={v.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={isSel}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(v)}
                className={cn(
                  "flex cursor-pointer items-start justify-between gap-2 rounded-lg border px-3 py-2",
                  isSel ? "border-leaf-600 bg-lime-50/60" : "border-line",
                  i === active && !isSel && "bg-sage-50",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{v.label}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {pct ? <span className="rounded bg-lime-100 px-1.5 py-px text-[0.6875rem] font-semibold text-forest-800">{pct}% OFF</span> : null}
                    <span className="text-[0.9375rem] font-bold tabular-nums text-ink">{formatINR(v.price)}</span>
                    {v.mrp && v.mrp > v.price ? <s className="text-xs text-muted tabular-nums">{formatINR(v.mrp)}</s> : null}
                  </span>
                  {unitPriceLabel(v.price, v.label) ? <span className="mt-0.5 block text-[0.6875rem] tabular-nums text-muted">{unitPriceLabel(v.price, v.label)}</span> : null}
                  {out ? <span className="mt-0.5 block text-xs font-medium text-danger">Out of stock</span> : null}
                </span>
                {isSel ? <Check className="mt-0.5 size-5 shrink-0 text-leaf-600" aria-hidden /> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

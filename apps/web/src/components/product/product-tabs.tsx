"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../ui/cn";

export interface TabDef {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

/** Accessible tabs (arrow keys move between tabs). Used for Description | Nutrition | Reviews. */
export function ProductTabs({ tabs, initial }: { tabs: TabDef[]; initial?: string }) {
  const [active, setActive] = useState(initial && tabs.some((t) => t.id === initial) ? initial : tabs[0]?.id);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // A link to #reviews (e.g. the star rating under the title) opens that tab.
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (tabs.some((t) => t.id === id)) setActive(id);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [tabs]);

  function onKey(e: KeyboardEvent, i: number) {
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    else return;
    e.preventDefault();
    setActive(tabs[n]!.id);
    refs.current[n]?.focus();
  }

  return (
    <div className="mt-10">
      <div role="tablist" aria-label="Product details" className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t, i) => {
          const sel = t.id === active;
          return (
            <button
              key={t.id}
              ref={(el) => { refs.current[i] = el; }}
              id={`${base}-tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={sel}
              aria-controls={`${base}-panel-${t.id}`}
              tabIndex={sel ? 0 : -1}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[0.9375rem] font-semibold transition-colors",
                sel ? "border-forest-800 text-forest-800" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`${base}-panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${t.id}`}
          hidden={t.id !== active}
          tabIndex={0}
          className="pt-5 focus-visible:outline-none"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}

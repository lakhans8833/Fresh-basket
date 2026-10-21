"use client";

import { useId } from "react";
import { UNAVAILABLE_ITEM_LABEL, UNAVAILABLE_ITEM_PREFERENCES, type UnavailableItemPreference } from "@freshbasket/shared";
import { cn } from "../ui/cn";

/**
 * "If an item isn't available": call first (default) or remove + refund. There is no
 * automatic-substitute option — nothing is swapped or charged extra without the customer's OK.
 */
export function UnavailableItemsChoice({ value, onChange }: { value: UnavailableItemPreference; onChange: (v: UnavailableItemPreference) => void }) {
  // Unique radio-group names: a second copy of this form (e.g. a page kept in the background) must
  // never share them, or React refuses the click ("Mixing React and non-React radio inputs").
  const rg = useId();
  return (
    <fieldset>
      <legend className="text-sm font-medium text-ink-soft">If an item isn&apos;t available</legend>
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        {UNAVAILABLE_ITEM_PREFERENCES.map((p) => (
          <label
            key={p}
            className={cn(
              "flex cursor-pointer gap-2.5 rounded-xl border-2 px-3 py-2.5 text-sm has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lime-200",
              value === p ? "border-leaf-500 bg-lime-50" : "border-line bg-white hover:border-forest-700/30",
            )}
          >
            <input type="radio" name={`${rg}-unavailable-items`} value={p} checked={value === p} onChange={() => onChange(p)} className="mt-1 accent-forest-800" />
            <span>
              <span className="block font-semibold text-ink">{UNAVAILABLE_ITEM_LABEL[p].title}</span>
              <span className="block text-xs text-muted">{UNAVAILABLE_ITEM_LABEL[p].detail}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

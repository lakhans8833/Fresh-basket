"use client";

import { Banknote, CalendarClock, Clock, Scale } from "lucide-react";
import { useNextSlotLabel } from "../layout/next-slot";

/** "Delivery Today, 12–3 PM" under the product name (the next slot that can still be booked). */
export function DeliveryPill() {
  const slot = useNextSlotLabel();
  if (!slot) return null;
  return (
    <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-sage-100 px-2 py-1 text-xs font-bold text-ink">
      <Clock className="size-3.5 text-leaf-600" aria-hidden /> Delivery {slot}
    </p>
  );
}

/** Short reasons to order here — only things the store really does. */
export function WhyShop({ codEnabled }: { codEnabled: boolean }) {
  const rows = [
    { icon: <CalendarClock className="size-5" aria-hidden />, title: "Choose your delivery slot", text: "Pick a time that suits you at checkout." },
    { icon: <Scale className="size-5" aria-hidden />, title: "Buy just what you need", text: "Pick the pack size that suits you." },
    ...(codEnabled ? [{ icon: <Banknote className="size-5" aria-hidden />, title: "Cash on delivery", text: "Pay when your order arrives." }] : []),
  ];
  return (
    <section aria-labelledby="why-shop" className="mt-6 border-t border-line pt-5">
      <h2 id="why-shop" className="font-sans text-base font-bold text-ink">Why shop from us?</h2>
      <ul className="mt-3 space-y-3">
        {rows.map((r) => (
          <li key={r.title} className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-lime-100 text-forest-800">{r.icon}</span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-ink">{r.title}</span>
              <span className="text-xs text-muted">{r.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

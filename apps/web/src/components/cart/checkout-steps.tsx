import { ArrowRight, Check } from "lucide-react";
import { cn } from "../ui/cn";

const STEPS = [
  { title: "Cart", text: "Review your items" },
  { title: "Checkout", text: "Enter your details" },
  { title: "Order on WhatsApp", text: "Confirm with seller" },
];

/** 1 Cart → 2 Checkout → 3 Order on WhatsApp. */
export function CheckoutSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2" aria-label="Order steps">
      {STEPS.map((s, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={s.title} className="flex items-center gap-3" aria-current={active ? "step" : undefined}>
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-base font-bold sm:size-11 sm:text-lg", done || active ? "bg-forest-800 text-white" : "border-2 border-forest-800/30 bg-white text-forest-800")}>
              {done ? <Check className="size-5" aria-hidden /> : n}
            </span>
            <span className="leading-tight">
              <span className={cn("block text-[0.9375rem] font-semibold sm:text-base", active ? "text-forest-800" : "text-ink")}>{s.title}</span>
              <span className="hidden text-xs text-muted sm:block">{s.text}</span>
            </span>
            {n < STEPS.length ? <ArrowRight className="mx-1 hidden size-4 text-ink-soft sm:block" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

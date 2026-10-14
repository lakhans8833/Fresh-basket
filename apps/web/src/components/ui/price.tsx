import { formatINR } from "@freshbasket/shared";
import { cn } from "./cn";

export function Price({ paise, className, mrp }: { paise: number; className?: string; mrp?: number | null }) {
  return (
    <span className={cn("tabular-nums", className)}>
      {formatINR(paise)}
      {mrp && mrp > paise ? <s className="ml-1.5 text-[0.8em] font-normal text-muted">{formatINR(mrp)}</s> : null}
    </span>
  );
}

/**
 * Whole-number discount from the MRP entered in Admin (rounded down, so we never overstate it).
 * Returns null when there's no MRP, it isn't higher than the price, or the saving is under 1%.
 */
export function percentOff(price: number, mrp: number | null | undefined): number | null {
  if (!mrp || mrp <= price || mrp <= 0) return null;
  const pct = Math.floor(((mrp - price) / mrp) * 100);
  return pct >= 1 ? pct : null;
}

/** "20% OFF" tag shown on product photos — only when the admin has set a higher MRP. */
export function DiscountBadge({ price, mrp, className }: { price: number; mrp: number | null | undefined; className?: string }) {
  const pct = percentOff(price, mrp);
  if (pct === null) return null;
  return (
    <span className={cn("inline-flex items-center rounded-md bg-offer px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-white shadow-sm", className)}>
      {pct}% off
    </span>
  );
}

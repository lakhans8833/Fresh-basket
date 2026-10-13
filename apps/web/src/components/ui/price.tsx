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

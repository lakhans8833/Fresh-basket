import { Star } from "lucide-react";
import { cn } from "../ui/cn";

/** Read-only star row (rounded to the nearest half for display). */
export function Stars({ value, className, size = "size-4" }: { value: number; className?: string; size?: string }) {
  const r = Math.round(value * 2) / 2;
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="relative inline-block">
          <Star className={cn(size, "text-sage-200")} fill="currentColor" strokeWidth={0} />
          {r >= i - 0.5 ? (
            <span className="absolute inset-0 overflow-hidden" style={{ width: r >= i ? "100%" : "50%" }}>
              <Star className={cn(size, "text-[#e8a317]")} fill="currentColor" strokeWidth={0} />
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

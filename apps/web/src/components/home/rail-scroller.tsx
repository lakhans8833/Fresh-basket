"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../ui/cn";

/** Horizontal list that scrolls by swipe / trackpad, with ‹ › buttons on larger screens. */
export function RailScroller({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, []);
  const by = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 200), behavior: "smooth" });
  };
  const arrow = "absolute top-[38%] z-10 hidden size-9 -translate-y-1/2 place-items-center rounded-full border border-line bg-white text-ink shadow-md hover:bg-lime-50 md:grid";
  return (
    <div className="relative">
      <ul ref={ref} aria-label={label} className="no-scrollbar -mx-4 -mt-1 flex snap-x gap-2.5 overflow-x-auto scroll-px-4 px-4 pb-2.5 pt-1 sm:-mx-6 sm:gap-3 sm:scroll-px-6 sm:px-6 lg:-mx-1 lg:scroll-px-1 lg:px-1">
        {children}
      </ul>
      <button type="button" onClick={() => by(-1)} aria-label={`Scroll ${label} back`} tabIndex={-1} className={cn(arrow, "-left-4", edges.start && "md:hidden")}>
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <button type="button" onClick={() => by(1)} aria-label={`Scroll ${label} forward`} tabIndex={-1} className={cn(arrow, "-right-4", edges.end && "md:hidden")}>
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
  );
}

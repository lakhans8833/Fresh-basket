"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBasket, ChevronRight } from "lucide-react";
import { formatINR } from "@freshbasket/shared";
import { useCart } from "../cart/cart-context";

/** Pages that already have their own buy / pay actions at the bottom of the screen. */
const HIDDEN = /^\/(product|cart|checkout|order|pay|track|account|login|reset-password)(\/|$)/;

/**
 * Phones: while the basket has items, a bar above the tab bar shows the count and value and opens the
 * cart in one tap (the quick-commerce pattern shoppers know from Blinkit / Instamart).
 */
export function CartBar() {
  const pathname = usePathname();
  const { count, itemsTotal, hydrated } = useCart();
  if (!hydrated || count === 0 || HIDDEN.test(pathname)) return null;
  return (
    <>
    {/* Room at the end of the page so the bar never covers the footer. */}
    <div aria-hidden className="h-16 md:hidden" />
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 px-3 pb-2 md:hidden print:hidden">
      <Link
        href="/cart"
        className="flex items-center gap-3 rounded-2xl bg-forest-800 px-4 py-2.5 text-white shadow-[0_10px_24px_-12px_rgb(11_102_35/0.8)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lime-200"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15"><ShoppingBasket className="size-5" aria-hidden /></span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-sm font-semibold">{count} item{count === 1 ? "" : "s"}</span>
          <span className="text-sm tabular-nums text-white/85">{formatINR(itemsTotal)}</span>
        </span>
        <span className="inline-flex items-center gap-0.5 text-[0.9375rem] font-semibold">View cart <ChevronRight className="size-4" aria-hidden /></span>
      </Link>
    </div>
    </>
  );
}

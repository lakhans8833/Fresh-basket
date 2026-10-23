"use client";

import Link from "next/link";
import { ArrowRight, MapPin, Package } from "lucide-react";
import { formatINR, ORDER_STATUS_LABEL, type Address, type Order } from "@freshbasket/shared";
import { formatDeliveryDate, statusTone } from "./order-detail";
import { cn } from "../ui/cn";

/** Quick cards on the profile page: latest order and default address. */
export function AccountOverview({ recent, defaultAddress }: { recent: Order | null; defaultAddress: Address | null }) {
  // Count packs the same way as the "My orders" list (2 × Broccoli + 1 × Cabbage = 3 items).
  const recentCount = recent ? recent.items.reduce((s, i) => s + i.quantity, 0) : 0;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <section aria-labelledby="recent-heading" className="flex flex-col rounded-[var(--radius-card)] border border-line bg-white p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-lime-100 text-forest-700"><Package className="size-4" aria-hidden /></span>
          <h2 id="recent-heading" className="font-sans text-base font-semibold text-ink">Latest order</h2>
        </div>
        {recent ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <p className="font-semibold text-ink">{recent.orderNumber}</p>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", statusTone(recent.status))}>{ORDER_STATUS_LABEL[recent.status]}</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {recentCount} item{recentCount === 1 ? "" : "s"} · {formatINR(recent.total)} · delivery {formatDeliveryDate(recent.deliveryDate)}
            </p>
            <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4 text-sm font-semibold">
              <Link href={`/orders/${recent.id}`} className="inline-flex items-center gap-1 text-leaf-600 hover:text-forest-800">View / track <ArrowRight className="size-3.5" aria-hidden /></Link>
              <Link href="/account/orders" className="text-muted hover:text-forest-800">All orders</Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-muted">You haven&apos;t placed an order yet.</p>
            <Link href="/shop" className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-leaf-600 hover:text-forest-800">Start shopping <ArrowRight className="size-3.5" aria-hidden /></Link>
          </>
        )}
      </section>

      <section aria-labelledby="address-heading" className="flex flex-col rounded-[var(--radius-card)] border border-line bg-white p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-full bg-lime-100 text-forest-700"><MapPin className="size-4" aria-hidden /></span>
          <h2 id="address-heading" className="font-sans text-base font-semibold text-ink">Default address</h2>
        </div>
        {defaultAddress ? (
          <>
            <p className="mt-4 font-semibold text-ink">{defaultAddress.label} · {defaultAddress.fullName}</p>
            <p className="mt-1 text-sm text-muted">
              {[defaultAddress.line1, defaultAddress.line2, defaultAddress.landmark, defaultAddress.city, defaultAddress.pincode].filter(Boolean).join(", ")}
            </p>
            <Link href="/account/addresses" className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-leaf-600 hover:text-forest-800">
              Manage addresses <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-muted">No saved address yet. Save one to check out faster.</p>
            <Link href="/account/addresses" className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-semibold text-leaf-600 hover:text-forest-800">
              Add an address <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </>
        )}
      </section>
    </div>
  );
}

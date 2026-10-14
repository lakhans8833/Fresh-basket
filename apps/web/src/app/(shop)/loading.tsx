import { ProductCardSkeleton } from "@/components/product/product-card";

/** Shown while a shop page (home, cart, info pages…) loads its live data. Pages with their own loading.tsx override this. */
export default function Loading() {
  return (
    <div className="container-page pt-6 md:pt-8" aria-busy="true" aria-label="Loading">
      <div className="skeleton aspect-[16/7] w-full rounded-[var(--radius-card)] sm:aspect-[16/5]" />
      <div className="mt-8 flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-28 w-[40%] shrink-0 sm:w-40" />)}
      </div>
      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)}
      </div>
    </div>
  );
}

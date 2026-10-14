import { ProductCardSkeleton } from "@/components/product/product-card";

export default function Loading() {
  return (
    <div className="container-page pt-10" aria-busy="true" aria-label="Loading products">
      <div className="skeleton h-12 w-72" />
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[15rem_1fr]">
        <div className="skeleton hidden h-80 lg:block" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      </div>
    </div>
  );
}

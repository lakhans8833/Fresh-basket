"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import type { ProductSummary } from "@freshbasket/shared";
import { api } from "@/lib/client/api";
import { ButtonLink } from "../ui/button";
import { EmptyState, Notice } from "../ui/feedback";
import { onFavouritesChange, readFavourites } from "./favourites";
import { ProductCard, ProductCardSkeleton } from "./product-card";

const grid = "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

/** Lists the products saved with the ♥ button, with live prices and stock from the catalogue. */
export function WishlistView() {
  const [ids, setIds] = useState<string[] | null>(null);
  const [catalog, setCatalog] = useState<ProductSummary[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const sync = () => setIds(readFavourites());
    sync();
    return onFavouritesChange(sync);
  }, []);

  const wanted = ids !== null && ids.length > 0;
  // Fetch exactly the saved products (not the first 200 of the catalogue), newest 200 saves.
  const idsKey = ids ? ids.slice(-200).join(",") : "";
  // Fetch again when a product saved since (e.g. in another tab) isn't in what we have.
  const missing = !!ids && ids.slice(-200).some((id) => !catalog?.some((p) => p.id === id));
  useEffect(() => {
    if (!wanted || (catalog && !missing)) return;
    api<{ products: ProductSummary[] }>(`/api/products?limit=200&ids=${encodeURIComponent(idsKey)}`)
      .then((r) => setCatalog(r.products))
      .catch(() => setError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch only when the saved list changes
  }, [wanted, idsKey]);

  if (ids === null || (wanted && !catalog && !error)) {
    return <div className={grid} aria-busy="true">{Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)}</div>;
  }
  if (error) return <Notice tone="error">Couldn&apos;t load your saved items. Please refresh the page.</Notice>;

  // Newest saved first; products the shop has removed are skipped.
  const byId = new Map((catalog ?? []).map((p) => [p.id, p]));
  const products = [...ids].reverse().map((id) => byId.get(id)).filter((p): p is ProductSummary => !!p);

  if (products.length === 0) {
    return (
      <EmptyState icon={<Heart className="size-7" />} title="Nothing saved yet" action={<ButtonLink href="/shop">Browse products</ButtonLink>}>
        Tap the ♥ on any product to save it here for your next order.
      </EmptyState>
    );
  }
  return (
    <>
      <p className="mb-4 text-sm text-muted">{products.length} saved {products.length === 1 ? "item" : "items"}</p>
      <div className={grid}>{products.map((p) => <ProductCard key={p.id} product={p} />)}</div>
    </>
  );
}

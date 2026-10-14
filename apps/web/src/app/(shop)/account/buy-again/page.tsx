import type { Metadata } from "next";
import { RotateCcw } from "lucide-react";
import { listBuyAgain } from "@/lib/catalog";
import { requireAccountSession } from "../require-session";
import { ProductCard } from "@/components/product/product-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export const metadata: Metadata = { title: "Buy again" };

/** Everything the customer has ordered before, newest first, with today's prices — like a "smart basket". */
export default async function BuyAgainPage() {
  const { userId } = await requireAccountSession("/account/buy-again");
  const { products, lastVariant } = await listBuyAgain(userId, 60).catch((e) => (console.error("[buy-again]", e), { products: [], lastVariant: {} as Record<string, string> }));
  return (
    <section aria-labelledby="buy-again-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 id="buy-again-heading" className="text-2xl font-semibold text-forest-900">Buy again</h1>
        {products.length ? <p className="text-sm text-muted">From your past orders · today&apos;s prices · opens on the pack you bought last</p> : null}
      </div>
      {products.length === 0 ? (
        <div className="mt-5">
          <EmptyState icon={<RotateCcw className="size-7" />} title="Nothing here yet" action={<ButtonLink href="/shop">Start shopping</ButtonLink>}>
            Products from your orders appear here, so you can add them again in one tap.
          </EmptyState>
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} preferVariantId={lastVariant[p.id]} />)}
        </div>
      )}
    </section>
  );
}

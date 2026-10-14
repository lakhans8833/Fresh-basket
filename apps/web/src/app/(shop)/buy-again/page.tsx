import type { Metadata } from "next";
import { RotateCcw, ShoppingBasket } from "lucide-react";
import { listBuyAgain } from "@/lib/catalog";
import { storeConfig } from "@/config/store";
import { requireAccountSession } from "../account/require-session";
import { PageBanner } from "@/components/layout/page-banner";
import { ProductCard } from "@/components/product/product-card";
import { EmptyState } from "@/components/ui/feedback";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Buy again", robots: { index: false } };

/** Everything the customer has ordered before (still on sale), most recent first. */
export default async function BuyAgainPage() {
  const session = await requireAccountSession("/buy-again");
  const { products, lastVariant } = await listBuyAgain(session.userId, 60).catch((e) => (console.error("[buy-again]", e), { products: [], lastVariant: {} as Record<string, string> }));
  return (
    <>
      <PageBanner title="Buy again" subtitle="Items from your past orders — opens on the pack size you bought last time." icon={<RotateCcw className="size-7" aria-hidden />} script={storeConfig.secondaryTagline} />
      <div className="container-page pb-12 pt-6 md:pt-8">
        {products.length === 0 ? (
          <EmptyState icon={<ShoppingBasket className="size-7" aria-hidden />} title="Nothing to buy again yet" action={<ButtonLink href="/shop">Start shopping</ButtonLink>}>
            After your first order, the items you bought will appear here for quick re-ordering.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {products.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} preferVariantId={lastVariant[p.id]} />)}
          </div>
        )}
      </div>
    </>
  );
}

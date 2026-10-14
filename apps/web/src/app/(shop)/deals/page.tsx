import type { Metadata } from "next";
import { BadgePercent, Tag } from "lucide-react";
import { listDeals } from "@/lib/catalog";
import { storeConfig } from "@/config/store";
import { PageBanner } from "@/components/layout/page-banner";
import { ProductCard } from "@/components/product/product-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";

export const metadata: Metadata = {
  title: "Deals & offers on fresh fruits & vegetables",
  description: `Fruits and vegetables priced below MRP right now, with home delivery in ${storeConfig.serviceArea}.`,
  alternates: { canonical: "/deals" },
};

/** Products with a pack priced below the MRP set in Admin — nothing here is made up. */
export default async function DealsPage() {
  const deals = await listDeals();
  return (
    <>
      <PageBanner title="Deals & offers" subtitle="Products priced below MRP right now — biggest savings first." icon={<BadgePercent className="size-7" aria-hidden />} script={storeConfig.secondaryTagline} />
      <div className="container-page pb-12 pt-6 md:pt-8">
        {deals.length === 0 ? (
          <EmptyState icon={<Tag className="size-7" />} title="No offers right now" action={<ButtonLink href="/shop">Shop all products</ButtonLink>}>
            Check back soon — offers appear here as soon as they&apos;re added.
          </EmptyState>
        ) : (
          <>
            <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-forest-800 px-3.5 py-1.5 text-sm font-semibold text-white">
              <Tag className="size-4" aria-hidden /> {deals.length} {deals.length === 1 ? "item" : "items"}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {deals.map((p, i) => <ProductCard key={p.id} product={p} priority={i < 4} />)}
            </div>
          </>
        )}
      </div>
    </>
  );
}

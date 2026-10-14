import type { Metadata } from "next";
import { Heart } from "lucide-react";
import { storeConfig } from "@/config/store";
import { PageBanner } from "@/components/layout/page-banner";
import { WishlistView } from "@/components/product/wishlist-view";

export const metadata: Metadata = {
  title: "Saved items",
  description: "Fruits and vegetables you saved for later.",
  robots: { index: false },
};

export default function WishlistPage() {
  return (
    <>
      <PageBanner title="Saved items" subtitle="Products you tapped ♥ on. Saved on this phone / browser only." icon={<Heart className="size-7" aria-hidden />} script={storeConfig.secondaryTagline} />
      <div className="container-page pb-12 pt-6 md:pt-8">
        <WishlistView />
      </div>
    </>
  );
}

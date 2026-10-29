import type { Metadata } from "next";
import { packGrams } from "@freshbasket/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Home, Tag } from "lucide-react";
import { getProduct, listProducts } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { resolveWhatsAppNumber, storeConfig } from "@/config/store";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductPurchase } from "@/components/product/product-purchase";
import { FavouriteButton } from "@/components/product/favourite-button";
import { ProductRail } from "@/components/home/sections";
import { ProductTabs } from "@/components/product/product-tabs";
import { ReviewsPanel } from "@/components/product/reviews-panel";
import { Stars } from "@/components/product/stars";
import { getProductReviews } from "@/lib/reviews";
import { DeliveryPill, WhyShop } from "@/components/product/product-extras";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  if (!p) return { title: "Product not found", robots: { index: false } };
  const from = p.variants.length ? `from ₹${Math.min(...p.variants.map((v) => v.price)) / 100}` : "";
  const description = `${p.description ? `${p.description} ` : ""}Buy ${p.name.toLowerCase()} online ${from} with home delivery in ${storeConfig.serviceArea}.`.slice(0, 300);
  return {
    title: `${p.name} — buy online`,
    description,
    alternates: { canonical: `/product/${p.slug}` },
    openGraph: { title: p.name, description, images: p.images[0] ? [{ url: p.images[0].url, alt: p.images[0].alt ?? p.name }] : undefined },
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  const product = await getProduct((await params).slug);
  if (!product) notFound();
  const [relatedAll, settings, reviews] = await Promise.all([
    listProducts({ category: product.categorySlug, limit: 15 }),
    getSettings(),
    getProductReviews(product.id),
  ]);
  const related = relatedAll.filter((p) => p.id !== product.id).slice(0, 14);
  const abs = (u: string) => (u.startsWith("http") ? u : `${storeConfig.siteUrl}${u}`);
  // Product structured data built only from real data: ratings only when approved customer reviews exist.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.images.map((i) => abs(i.url)),
    category: product.categoryName,
    brand: { "@type": "Brand", name: settings.storeName },
    ...(reviews.count > 0 && reviews.average !== null
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: reviews.average, reviewCount: reviews.count, bestRating: 5, worstRating: 1 } }
      : {}),
    offers: product.variants.map((v) => ({
      "@type": "Offer",
      name: `${product.name} ${v.label}`,
      price: (v.price / 100).toFixed(2),
      priceCurrency: "INR",
      availability: v.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: abs(`/product/${product.slug}`),
      seller: { "@type": "Organization", name: settings.storeName },
    })),
  };

  // "Sold by weight" is derived from the pack labels; other notes are the highlights set in Admin.
  const byWeight = product.variants.length > 0 && product.variants.every((v) => packGrams(v.label) !== null);
  // Product information rows — only the ones the owner filled in under Admin → Products.
  const info: [string, string][] = [];
  for (const [k, v] of [["Storage", product.storageTips], ["Shelf life", product.shelfLife], ["Origin", product.origin]] as const) {
    if (v) info.push([k, v]);
  }
  const notes = [...(byWeight ? ["Sold by weight"] : []), ...product.highlights.filter((h) => h.toLowerCase() !== "sold by weight")];
  return (
    <>
      <div className="container-page pt-4 md:pt-6">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center [&_a]:-my-2.5 [&_a]:py-2.5 gap-1.5 text-[0.8125rem] text-ink-soft">
          <Link href="/" className="inline-flex items-center gap-1.5 hover:text-forest-800"><Home className="size-4 text-forest-800" aria-hidden /> Home</Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <Link href={`/category/${product.categorySlug}`} className="hover:text-forest-800">{product.categoryName}</Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <span className="text-ink" aria-current="page">{product.name}</span>
        </nav>
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-0 lg:rounded-2xl lg:border lg:border-line lg:bg-white">
          <div className="lg:border-r lg:border-line lg:p-6">
            {/* Desktop: the photo stays in view while the buyer reads sizes and prices on the right. */}
            <div className="relative lg:sticky lg:top-28">
              <ProductGallery images={product.images} name={product.name} />
              <FavouriteButton productId={product.id} name={product.name} className="absolute right-4 top-4 size-11" />
            </div>
          </div>
          <div className="lg:p-8">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link
                href={`/category/${product.categorySlug}`}
                className="-my-2 inline-flex items-center gap-0.5 py-2 text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-leaf-600 hover:underline"
                aria-label={`View all ${product.categoryName}`}
              >
                {product.categoryName} <ChevronRight className="size-3.5" aria-hidden />
              </Link>
              {product.seasonal ? <span className="rounded-full bg-lime-100 px-2.5 py-0.5 text-xs font-bold text-forest-800">In season now</span> : null}
            </p>
            <h1 className="mt-1.5 text-2xl font-bold leading-tight text-ink md:text-[2rem]">{product.name}</h1>
            {reviews.count > 0 && reviews.average !== null ? (
              <a href="#reviews" className="mt-1.5 inline-flex items-center gap-2 text-sm text-ink-soft hover:text-forest-800">
                <Stars value={reviews.average} />
                <span><b className="text-ink">{reviews.average.toFixed(1)}</b> · {reviews.count} {reviews.count === 1 ? "review" : "reviews"}</span>
              </a>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <DeliveryPill />
              {notes.length ? (
                <ul className="flex flex-wrap gap-2" aria-label="Product notes">
                  {notes.map((h) => (
                    <li key={h} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-[0.8125rem] text-ink-soft">
                      <Tag className="size-3.5 text-leaf-600" aria-hidden /> {h}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <ProductPurchase product={product} whatsappEnabled={Boolean(resolveWhatsAppNumber(settings.whatsapp))} />
            <WhyShop codEnabled={settings.codEnabled} />
          </div>
        </div>
        <div id="reviews">
          <ProductTabs
            tabs={[
              {
                id: "description",
                label: "Description",
                content: (
                  <div className="max-w-3xl">
                    {product.description ? <p className="whitespace-pre-line leading-relaxed text-ink-soft">{product.description}</p> : <p className="text-muted">No description yet.</p>}
                    {info.length ? (
                      <dl className="mt-5 divide-y divide-line rounded-xl border border-line bg-white text-sm">
                        {info.map(([k, v]) => (
                          <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 px-4 py-3">
                            <dt className="font-medium text-muted">{k}</dt>
                            <dd className="text-ink-soft">{v}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </div>
                ),
              },
              // The Nutrition tab only exists when the owner has written nutrition details (no empty tab).
              ...(product.nutrition?.trim()
                ? [{
                    id: "nutrition",
                    label: "Nutrition",
                    content: <p className="max-w-3xl whitespace-pre-line leading-relaxed text-ink-soft">{product.nutrition}</p>,
                  }]
                : []),
              {
                id: "reviews",
                label: reviews.count > 0 ? `Reviews (${reviews.count})` : "Reviews",
                content: <ReviewsPanel productId={product.id} productSlug={product.slug} average={reviews.average} count={reviews.count} reviews={reviews.reviews} />,
              },
            ]}
          />
        </div>
      </div>
      <ProductRail id="related" title={`More ${product.categoryName.toLowerCase()}`} href={`/category/${product.categorySlug}`} products={related} />
    </>
  );
}

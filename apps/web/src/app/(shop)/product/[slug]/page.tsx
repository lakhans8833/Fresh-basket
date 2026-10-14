import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Home, Tag } from "lucide-react";
import { getProduct, listProducts } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { storeConfig } from "@/config/store";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductPurchase } from "@/components/product/product-purchase";
import { FavouriteButton } from "@/components/product/favourite-button";
import { ProductRail } from "@/components/home/sections";

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
  const related = (await listProducts({ category: product.categorySlug, limit: 5 })).filter((p) => p.id !== product.id).slice(0, 4);
  const settings = await getSettings();
  const abs = (u: string) => (u.startsWith("http") ? u : `${storeConfig.siteUrl}${u}`);
  // Product structured data built only from real catalogue data (no ratings or reviews).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.images.map((i) => abs(i.url)),
    category: product.categoryName,
    brand: { "@type": "Brand", name: settings.storeName },
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

  return (
    <>
      <div className="container-page pt-6 md:pt-10">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">
          <Link href="/" className="inline-flex items-center gap-1.5 hover:text-forest-800"><Home className="size-4 text-forest-800" aria-hidden /> Home</Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <Link href={`/category/${product.categorySlug}`} className="hover:text-forest-800">{product.categoryName}</Link>
          <ChevronRight className="size-3.5" aria-hidden />
          <span className="text-ink" aria-current="page">{product.name}</span>
        </nav>
        <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
          <div className="relative">
            <ProductGallery images={product.images} name={product.name} />
            <FavouriteButton productId={product.id} name={product.name} className="absolute right-4 top-4 size-11" />
          </div>
          <div className="lg:pt-4">
            {product.seasonal ? <p className="eyebrow text-leaf-600">In season now</p> : null}
            <h1 className="mt-1 text-[2.25rem] font-bold leading-tight text-forest-800 md:text-[2.75rem]">{product.name}</h1>
            {product.highlights.length ? (
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Product notes">
                {product.highlights.map((h) => (
                  <li key={h} className="inline-flex items-center gap-1.5 rounded-full bg-sage-100 px-3 py-1 text-[0.8125rem] text-ink-soft">
                    <Tag className="size-3.5 text-leaf-600" aria-hidden /> {h}
                  </li>
                ))}
              </ul>
            ) : null}
            <ProductPurchase product={product} />
            {product.description ? (
              <section aria-labelledby="about" className="mt-10 border-t border-line pt-6">
                <h2 id="about" className="font-sans text-base font-semibold text-ink">About this product</h2>
                <p className="mt-2 leading-relaxed text-ink-soft">{product.description}</p>
              </section>
            ) : null}
          </div>
        </div>
      </div>
      <ProductRail id="related" title={`More ${product.categoryName.toLowerCase()}`} href={`/category/${product.categorySlug}`} products={related} />
    </>
  );
}

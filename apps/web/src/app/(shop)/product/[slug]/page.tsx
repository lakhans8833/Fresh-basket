import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Tag } from "lucide-react";
import { getProduct, listProducts } from "@/lib/catalog";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductPurchase } from "@/components/product/product-purchase";
import { FavouriteButton } from "@/components/product/favourite-button";
import { ProductRail } from "@/components/home/sections";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await getProduct((await params).slug);
  return p ? { title: p.name, description: p.description ?? undefined } : { title: "Product not found" };
}

export default async function ProductPage({ params }: { params: Params }) {
  const product = await getProduct((await params).slug);
  if (!product) notFound();
  const related = (await listProducts({ category: product.categorySlug, limit: 5 })).filter((p) => p.id !== product.id).slice(0, 4);

  return (
    <>
      <div className="container-page pt-6 md:pt-10">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <Link href="/" className="hover:text-forest-800">Home</Link> <span aria-hidden>/</span>{" "}
          <Link href={`/shop?category=${product.categorySlug}`} className="hover:text-forest-800">{product.categoryName}</Link> <span aria-hidden>/</span>{" "}
          <span className="text-ink">{product.name}</span>
        </nav>
        <div className="mt-5 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
          <div className="relative">
            <ProductGallery images={product.images} name={product.name} />
            <FavouriteButton productId={product.id} name={product.name} className="absolute right-4 top-4 size-11" />
          </div>
          <div className="lg:pt-4">
            {product.seasonal ? <p className="eyebrow text-leaf-600">In season now</p> : null}
            <h1 className="mt-1 text-[2.6rem] font-semibold leading-tight text-forest-900 md:text-[3.2rem]">{product.name}</h1>
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
      <ProductRail id="related" title={`More ${product.categoryName.toLowerCase()}`} href={`/shop?category=${product.categorySlug}`} products={related} />
    </>
  );
}

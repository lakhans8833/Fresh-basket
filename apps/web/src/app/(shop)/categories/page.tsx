import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Leaf } from "lucide-react";
import { listCategories } from "@/lib/catalog";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const categories = await listCategories();
  const tiles = [
    { href: "/shop", name: "All vegetables", sub: "Everything in stock today", image: "/images/dev/all-basket.jpg" },
    ...categories.map((c) => ({ href: `/category/${c.slug}`, name: c.name, sub: `${c.productCount ?? 0} products`, image: c.imageUrl })),
    { href: "/shop?seasonal=1", name: "In season now", sub: "Seasonal picks", image: "/images/dev/seasonal-mix.jpg" },
  ];
  return (
    <div className="container-page pt-8 md:pt-12">
      <h1 className="text-[2.2rem] font-semibold text-forest-900 md:text-5xl">Categories</h1>
      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.href}>
            <Link href={t.href} className="group flex items-center gap-4 rounded-[var(--radius-card)] border border-line bg-white p-3 transition hover:shadow-[var(--shadow-card)]">
              <span className="relative size-20 shrink-0 overflow-hidden rounded-2xl border border-line bg-white">
                {t.image ? <Image src={t.image} alt="" fill sizes="80px" className="object-contain" /> : <Leaf className="m-6 size-8 text-leaf-500" />}
              </span>
              <span className="flex-1">
                <span className="block text-lg font-semibold text-ink">{t.name}</span>
                <span className="text-sm text-muted">{t.sub}</span>
              </span>
              <ArrowRight className="mr-2 size-5 text-forest-700 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

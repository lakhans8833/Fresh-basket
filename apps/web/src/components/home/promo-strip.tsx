import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Leaf } from "lucide-react";
import type { PromoBanner } from "@freshbasket/shared";
import { cn } from "../ui/cn";

const THEMES: Record<PromoBanner["theme"], { card: string; sub: string; cta: string }> = {
  green: { card: "bg-forest-800 text-white", sub: "text-white/80", cta: "bg-lime-300 text-forest-900" },
  lime: { card: "bg-lime-100 text-forest-900", sub: "text-forest-800/80", cta: "bg-forest-800 text-white" },
  amber: { card: "bg-[#fdf1dc] text-[#6b3f06]", sub: "text-[#6b3f06]/80", cta: "bg-[#c2410c] text-white" },
  ivory: { card: "border border-line bg-white text-forest-900", sub: "text-muted", cta: "bg-forest-800 text-white" },
};

/** One offer banner. Also used as the live preview in Admin → Banners. */
export function PromoCard({ banner, priority, asPreview }: { banner: Omit<PromoBanner, "id">; priority?: boolean; asPreview?: boolean }) {
  const t = THEMES[banner.theme] ?? THEMES.green;
  const body = (
    <>
      <span className="relative z-10 flex min-w-0 flex-1 flex-col justify-center gap-1 py-4 pl-4 pr-2 sm:pl-5">
        <span className="line-clamp-2 text-[1.0625rem] font-bold leading-tight sm:text-lg">{banner.title || "Banner title"}</span>
        {banner.subtitle ? <span className={cn("line-clamp-2 text-[0.8125rem] leading-snug", t.sub)}>{banner.subtitle}</span> : null}
        <span className={cn("mt-1.5 inline-flex w-fit items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold", t.cta)}>
          Shop now <ArrowRight className="size-3.5" aria-hidden />
        </span>
      </span>
      <span className="relative w-[40%] shrink-0 self-stretch overflow-hidden">
        {banner.imageUrl ? (
          <Image
            src={banner.imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 12vw, 35vw"
            priority={priority}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="grid h-full place-items-center opacity-30"><Leaf className="size-14" aria-hidden /></span>
        )}
      </span>
    </>
  );
  const cls = cn("group flex h-36 overflow-hidden rounded-2xl shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] sm:h-40", t.card);
  return asPreview ? <div className={cls}>{body}</div> : <Link href={banner.linkUrl} className={cls}>{body}</Link>;
}

/** Horizontally scrollable strip of offer banners under the hero (no autoplay). */
export function PromoStrip({ banners }: { banners: PromoBanner[] }) {
  if (!banners.length) return null;
  return (
    <section aria-label="Offers" className="container-page mt-6 md:mt-8">
      {/* phone: swipe through all; tablet: 2×2; laptop: 3; wide screens: 4 */}
      {/* Columns follow the number of banners, so two banners fill the width instead of half of it. */}
      <ul className={cn("no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0", banners.length >= 4 ? "lg:grid-cols-3 xl:grid-cols-4" : banners.length === 3 ? "lg:grid-cols-3" : "")}>
        {banners.slice(0, 8).map((b, i) => (
          <li key={b.id} className={cn("w-[82%] shrink-0 snap-start sm:w-auto", i >= 4 && "sm:hidden", i === 3 && "lg:hidden xl:block")}>
            <PromoCard banner={b} priority={i < 2} />
          </li>
        ))}
      </ul>
    </section>
  );
}

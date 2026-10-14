"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { cn } from "../ui/cn";

export interface HeroSlide {
  id: string;
  badge: string;
  title: [string, string];
  subtitle: string;
  cta: { href: string; label: string };
  secondary?: { href: string; label: string };
  image: string;
  imageAlt: string;
  script?: string;
}

/** Swipeable hero (CSS scroll-snap). No autoplay; arrows and dots for mouse and keyboard users. */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setIndex(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const n = (i + slides.length) % slides.length;
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  };

  return (
    <section aria-roledescription="carousel" aria-label="Highlights" className="relative">
      <div ref={track} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto scroll-smooth">
        {slides.map((s, i) => (
          <div
            key={s.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}`}
            className="relative w-full shrink-0 snap-start overflow-hidden bg-gradient-to-r from-[#f1f8e8] via-[#eef6e2] to-[#e2efd3]"
          >
            <div className="absolute inset-0 md:left-[34%]">
              <Image
                src={s.image}
                alt={s.imageAlt}
                fill
                priority={i === 0}
                sizes="(min-width: 768px) 66vw, 100vw"
                className="object-cover object-center opacity-30 md:opacity-100 md:[mask-image:linear-gradient(to_right,transparent,black_22%)]"
              />
            </div>
            <div className="container-page relative flex min-h-[22rem] items-center py-10 md:min-h-[26rem] lg:min-h-[28rem]">
              <div className="max-w-xl">
                <p className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-3.5 py-1.5 text-[0.8125rem] font-semibold text-white">
                  <MapPin className="size-4 text-lime-300" aria-hidden /> {s.badge}
                </p>
                <h2 className="mt-4 text-[2.35rem] font-bold leading-[1.05] text-forest-800 sm:text-5xl lg:text-[3.5rem]">
                  {s.title[0]}
                  <span className="block text-forest-900">{s.title[1]}</span>
                </h2>
                <p className="mt-3 text-lg font-medium text-ink-soft sm:text-xl">{s.subtitle}</p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link href={s.cta.href} className="inline-flex h-13 items-center gap-2 rounded-full bg-forest-800 px-7 text-lg font-semibold text-white shadow-[0_10px_24px_-12px_rgb(11_102_35/0.8)] hover:bg-forest-900">
                    {s.cta.label} <ChevronRight className="size-5" aria-hidden />
                  </Link>
                  {s.secondary ? (
                    <Link href={s.secondary.href} className="inline-flex h-13 items-center gap-2 rounded-full bg-white/80 px-6 text-base font-semibold text-forest-800 ring-1 ring-forest-800/15 hover:bg-white">
                      {s.secondary.label} <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  ) : null}
                </div>
              </div>
              {s.script ? (
                <p aria-hidden className="absolute bottom-10 right-8 hidden max-w-64 -rotate-6 rounded-2xl bg-white/85 px-5 py-3 text-center font-script text-[2.3rem] font-bold leading-[0.9] text-forest-800 shadow-lg backdrop-blur-sm xl:block">
                  {s.script}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {slides.length > 1 ? (
        <>
          <button type="button" onClick={() => go(index - 1)} aria-label="Previous slide" className="absolute left-3 top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white text-forest-800 shadow-md hover:bg-lime-50 md:grid">
            <ChevronLeft className="size-5" />
          </button>
          <button type="button" onClick={() => go(index + 1)} aria-label="Next slide" className="absolute right-3 top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white text-forest-800 shadow-md hover:bg-lime-50 md:grid">
            <ChevronRight className="size-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 rounded-full bg-white/70 px-2.5 py-1.5 backdrop-blur">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                className={cn("h-2.5 rounded-full transition-all", i === index ? "w-6 bg-forest-800" : "w-2.5 bg-forest-800/30")}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

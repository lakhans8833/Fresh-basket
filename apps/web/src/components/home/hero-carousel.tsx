"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, MapPin, Pause, Play } from "lucide-react";
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

/** Time each slide stays before moving on, and the cross-fade length. */
const SLIDE_MS = 5000;
const FADE_MS = 600;

/**
 * Home hero slider.
 * - Auto-plays every 5 s and loops (last → first) with a 600 ms cross-fade.
 * - Pauses while the mouse is over it, while it's touched or swiped, while keyboard focus is inside,
 *   and while the tab is hidden; starts a fresh 5 s again once released.
 * - No auto-play for people who prefer reduced motion (they still get arrows, dots and swipe).
 * - The active dot fills up to show how long until the next slide; a Pause/Play button stops it.
 */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const count = slides.length;
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [touching, setTouching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [stopped, setStopped] = useState(false); // user pressed Pause
  const [cycle, setCycle] = useState(0); // bumps to restart the 5 s timer + progress bar
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    const onVis = () => setHidden(document.hidden);
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      mq.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const running = count > 1 && !reduced && !stopped && !hovered && !touching && !focused && !hidden;

  // Whenever it (re)starts, give the current slide a full 5 seconds.
  const wasRunning = useRef(running);
  useEffect(() => {
    if (running && !wasRunning.current) setCycle((c) => c + 1);
    wasRunning.current = running;
  }, [running]);

  const go = useCallback(
    (i: number) => {
      setIndex(((i % count) + count) % count);
      setCycle((c) => c + 1);
    },
    [count],
  );

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => go(index + 1), SLIDE_MS);
    return () => clearTimeout(t);
  }, [running, index, cycle, go]);

  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Highlights"
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        else if (e.key === "ArrowLeft") go(index - 1);
      }}
      onTouchStart={(e) => {
        setTouching(true);
        const t = e.touches[0];
        touchStart.current = t ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const s = touchStart.current;
        const t = e.changedTouches[0];
        if (s && t) {
          const dx = t.clientX - s.x;
          const dy = t.clientY - s.y;
          // A clear sideways swipe changes slide; vertical scrolling is left alone.
          if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) go(index + (dx < 0 ? 1 : -1));
        }
        touchStart.current = null;
        setTouching(false);
      }}
      onTouchCancel={() => {
        touchStart.current = null;
        setTouching(false);
      }}
    >
      {/* All slides stacked in one grid cell (height = tallest slide); only the active one is visible. */}
      <div className="grid overflow-hidden" aria-live={running ? "off" : "polite"}>
        {slides.map((s, i) => {
          const active = i === index;
          return (
            <div
              key={s.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              aria-hidden={!active}
              inert={!active}
              style={{ transitionDuration: reduced ? "0ms" : `${FADE_MS}ms` } as CSSProperties}
              className={cn(
                "relative col-start-1 row-start-1 overflow-hidden bg-gradient-to-r from-[#f1f8e8] via-[#eef6e2] to-[#e2efd3] transition-[opacity,transform] ease-out",
                active ? "z-10 translate-x-0 opacity-100" : "pointer-events-none z-0 translate-x-3 opacity-0",
              )}
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
              <div className="container-page relative flex min-h-[22rem] items-center pb-16 pt-10 md:min-h-[26rem] md:py-12 lg:min-h-[28rem]">
                <div className="max-w-xl">
                  <p className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-3.5 py-1.5 text-[0.8125rem] font-semibold text-white">
                    <MapPin className="size-4 text-lime-300" aria-hidden /> {s.badge}
                  </p>
                  <h2 className="mt-4 text-[2.35rem] font-bold leading-[1.05] text-forest-800 sm:text-5xl lg:text-[3.5rem]">
                    {s.title[0]}
                    {s.title[1] ? <span className="block text-forest-900">{s.title[1]}</span> : null}
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
          );
        })}
      </div>
      {count > 1 ? (
        <>
          <button type="button" onClick={() => go(index - 1)} aria-label="Previous slide" className="absolute left-3 top-1/2 z-20 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white text-forest-800 shadow-md hover:bg-lime-50 md:grid">
            <ChevronLeft className="size-5" />
          </button>
          <button type="button" onClick={() => go(index + 1)} aria-label="Next slide" className="absolute right-3 top-1/2 z-20 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-white text-forest-800 shadow-md hover:bg-lime-50 md:grid">
            <ChevronRight className="size-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/75 py-1.5 pl-2.5 pr-1.5 backdrop-blur">
            {slides.map((s, i) => {
              const active = i === index;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={active ? "true" : undefined}
                  className={cn("relative h-2.5 overflow-hidden rounded-full transition-all", active ? "w-9 bg-forest-800/25" : "w-2.5 bg-forest-800/30 hover:bg-forest-800/50")}
                >
                  {active ? (
                    // Fills up over 5 s: how long until the next slide. Frozen while paused.
                    <span
                      key={`${index}-${cycle}`}
                      aria-hidden
                      className="hero-progress absolute inset-y-0 left-0 rounded-full bg-forest-800"
                      style={
                        reduced || stopped
                          ? { width: "100%", animation: "none" }
                          : { animationDuration: `${SLIDE_MS}ms`, animationPlayState: running ? "running" : "paused" }
                      }
                    />
                  ) : null}
                </button>
              );
            })}
            {!reduced ? (
              <button
                type="button"
                onClick={() => setStopped((v) => !v)}
                aria-label={stopped ? "Play slideshow" : "Pause slideshow"}
                className="ml-0.5 grid size-6 place-items-center rounded-full text-forest-800 hover:bg-white"
              >
                {stopped ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ChevronDown, LayoutDashboard, MapPin, ShoppingCart, Sprout, Truck, UserRound } from "lucide-react";
import { formatINR, type StoreSettings } from "@freshbasket/shared";
import { useCart } from "../cart/cart-context";
import { useSession } from "../account/session-context";
import { Logo } from "./logo";
import { SearchBox } from "./search-box";
import { LocationDialog } from "./location-dialog";
import { NextSlot } from "./next-slot";
import { cn } from "../ui/cn";

const NAV = [
  { href: "/", label: "Home", match: (p: string) => p === "/" },
  { href: "/shop", label: "Shop", match: (p: string) => p.startsWith("/shop") || p.startsWith("/category") || p.startsWith("/product") || p === "/categories" },
  { href: "/deals", label: "Offers", match: (p: string) => p === "/deals" },
  { href: "/about", label: "About Us", match: (p: string) => p === "/about" },
  { href: "/contact", label: "Contact", match: (p: string) => p === "/contact" },
];

/** Thin green strip above the header: brand line, announcement and delivery area. */
export function TopBar({ announcement, serviceArea }: { announcement: string | null; serviceArea: string }) {
  const { location } = useCart();
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-forest-800 text-white">
      <div className="container-page flex h-9 items-center justify-between gap-3 text-[0.8125rem] sm:h-10">
        <p className="hidden shrink-0 items-center gap-2 font-medium text-white/90 xl:flex">
          <Sprout className="size-4 text-lime-300" aria-hidden />
          Fresh Vegetables <span aria-hidden className="text-white/40">|</span> Better Health <span aria-hidden className="text-white/40">|</span> Happy You
        </p>
        {/* Announcement + delivery area may shrink (the announcement truncates), so a long announcement never makes the page wider than a tablet screen. */}
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 xl:flex-none xl:justify-end">
          <NextSlot className="flex shrink-0 items-center gap-1.5 lg:min-w-0 lg:shrink" />
          {announcement ? (
            <p className="hidden min-w-0 items-center gap-2 truncate lg:flex">
              <Truck className="size-4 shrink-0 text-lime-300" aria-hidden />
              <span className="truncate" title={announcement}>{announcement}</span>
            </p>
          ) : null}
          {announcement ? <span aria-hidden className="hidden h-4 w-px bg-white/30 lg:block" /> : null}
          <button type="button" onClick={() => setOpen(true)} className="ml-auto inline-flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 font-medium hover:bg-white/10 xl:ml-0">
            <MapPin className="size-4 shrink-0 text-lime-300" aria-hidden />
            <span className="min-w-0 truncate sm:max-w-44">
              {location ? <><span className="hidden sm:inline">Delivering to </span>{location.areaName}</> : serviceArea}
            </span>
            <ChevronDown className="size-3.5 shrink-0" aria-hidden />
            <span className="sr-only">— check delivery for your PIN code</span>
          </button>
        </div>
      </div>
      <LocationDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export function SiteHeader({ settings }: { settings: StoreSettings }) {
  const { count, hydrated, itemsTotal } = useCart();
  const { profile } = useSession();
  const pathname = usePathname();
  // Publish the header's real height (it changes with breakpoints, the announcement bar and the
  // phone search row) so in-page links and focused fields scroll to just below it.
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const set = () => document.documentElement.style.setProperty("--header-h", `${Math.round(el.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--header-h");
    };
  }, []);

  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-line bg-white/95 shadow-[0_1px_0_rgb(11_102_35/0.04),0_6px_20px_-16px_rgb(11_102_35/0.35)] backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div className="container-page flex h-[4.25rem] items-center gap-3 sm:h-[5.5rem] lg:gap-8">
        <Logo name={settings.storeName} logoUrl={settings.logoUrl} tagline={settings.tagline} className="min-w-0" />

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((n) => {
            const active = n.match(pathname);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative px-3 py-2 text-[0.9375rem] font-medium transition-colors after:absolute after:inset-x-3 after:-bottom-0.5 after:h-[3px] after:rounded-full after:transition-colors",
                  active ? "text-forest-800 after:bg-forest-800" : "text-ink hover:text-forest-800 after:bg-transparent",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden flex-1 md:block md:max-w-sm xl:max-w-md">
          <Suspense fallback={<div className="h-12 rounded-full border border-line bg-white" />}>
            <SearchBox />
          </Suspense>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-2 md:ml-0">
          {profile && profile.role !== "customer" ? (
            <Link href="/admin" aria-label="Admin dashboard" className="hidden size-11 place-items-center rounded-full text-forest-800 hover:bg-sage-100 sm:grid">
              <LayoutDashboard className="size-[1.35rem]" />
            </Link>
          ) : null}
          <Link
            href={profile ? "/account" : "/login"}
            // Same words for everyone: what you see is what screen readers announce ("Account" / "Sign in").
            aria-label={profile ? "Account" : "Sign in"}
            className="inline-flex h-11 items-center gap-2 rounded-full px-2.5 text-ink hover:bg-sage-100 hover:text-forest-800"
          >
            <UserRound className="size-[1.45rem] text-forest-800" />
            <span className="hidden text-[0.9375rem] font-medium xl:inline">{profile ? "Account" : "Sign in"}</span>
          </Link>
          <Link
            href="/cart"
            aria-label={`Cart, ${hydrated ? count : 0} item${count === 1 ? "" : "s"}`}
            className="relative inline-flex h-11 items-center gap-2 rounded-full px-2.5 text-ink hover:bg-sage-100 hover:text-forest-800"
          >
            <span className="relative">
              <ShoppingCart className="size-[1.5rem] text-forest-800" />
              {hydrated && count > 0 ? (
                <span className="absolute -right-2 -top-2 grid min-w-5 place-items-center rounded-full bg-tomato px-1 text-[0.6875rem] font-bold leading-5 text-white ring-2 ring-white">
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </span>
            <span className="hidden text-[0.9375rem] font-medium xl:inline">
              {hydrated && count > 0 ? <>{count} item{count === 1 ? "" : "s"} · <span className="tabular-nums">{formatINR(itemsTotal)}</span></> : "Cart"}
            </span>
          </Link>
        </div>
      </div>
      <div className="container-page pb-3 md:hidden">
        <Suspense fallback={<div className="h-11 rounded-full border border-line bg-white" />}>
          <SearchBox />
        </Suspense>
      </div>
    </header>
  );
}

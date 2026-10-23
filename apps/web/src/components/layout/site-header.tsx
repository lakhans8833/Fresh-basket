"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ChevronDown, Clock, LayoutDashboard, MapPin, Sprout, Truck, UserRound } from "lucide-react";
import type { StoreSettings } from "@freshbasket/shared";
import { useCart } from "../cart/cart-context";
import { useSession } from "../account/session-context";
import { Logo } from "./logo";
import { SearchBox } from "./search-box";
import { LocationDialog } from "./location-dialog";
import { NextSlot, useNextSlotLabel } from "./next-slot";
import { CartButton } from "../cart/cart-drawer";
import { cn } from "../ui/cn";

const NAV = [
  { href: "/shop", label: "Shop", match: (p: string) => p.startsWith("/shop") || p.startsWith("/category") || p === "/categories" },
  { href: "/deals", label: "Offers", match: (p: string) => p === "/deals" },
  { href: "/about", label: "About Us", match: (p: string) => p === "/about" },
  { href: "/contact", label: "Contact", match: (p: string) => p === "/contact" },
];

/**
 * Thin green strip above the header.
 * Phones/tablets: next delivery slot + delivery area. Laptops (where the header shows those): the
 * announcement and the page links.
 */
export function TopBar({ announcement, serviceArea }: { announcement: string | null; serviceArea: string }) {
  const { location } = useCart();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <div className="bg-forest-800 text-white">
      <div className="container-page flex h-9 items-center justify-between gap-3 text-[0.8125rem]">
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 lg:hidden">
          <NextSlot className="flex shrink-0 items-center gap-1.5" />
          <button type="button" onClick={() => setOpen(true)} className="ml-auto inline-flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 font-medium hover:bg-white/10">
            <MapPin className="size-4 shrink-0 text-lime-300" aria-hidden />
            <span className="min-w-0 truncate sm:max-w-44">
              {location ? <><span className="hidden sm:inline">Delivering to </span>{location.areaName}</> : serviceArea}
            </span>
            <ChevronDown className="size-3.5 shrink-0" aria-hidden />
            <span className="sr-only">— check delivery for your PIN code</span>
          </button>
        </div>
        <p className="hidden min-w-0 items-center gap-2 font-medium text-white/90 lg:flex">
          {announcement ? (
            <>
              <Truck className="size-4 shrink-0 text-lime-300" aria-hidden />
              <span className="truncate" title={announcement}>{announcement}</span>
            </>
          ) : (
            <>
              <Sprout className="size-4 text-lime-300" aria-hidden />
              Fresh Vegetables <span aria-hidden className="text-white/40">|</span> Better Health <span aria-hidden className="text-white/40">|</span> Happy You
            </>
          )}
        </p>
        <nav aria-label="Main" className="hidden shrink-0 items-center gap-1 lg:flex">
          {NAV.map((n) => {
            const active = n.match(pathname);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={cn("rounded-full px-3 py-1 font-medium transition-colors", active ? "bg-white/15 text-white" : "text-white/85 hover:bg-white/10 hover:text-white")}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <LocationDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

/** Laptops: "Delivery Today, 12–3 PM" with the area under it, like a quick-commerce ETA (but honest: a slot). */
function DeliveryBlock({ serviceArea }: { serviceArea: string }) {
  const { location } = useCart();
  const slot = useNextSlotLabel();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden min-w-0 max-w-[15rem] shrink flex-col items-start rounded-lg px-2 py-1 text-left hover:bg-sage-50 lg:flex"
      >
        <span className="flex items-center gap-1.5 whitespace-nowrap text-[0.9375rem] font-extrabold leading-tight text-ink">
          <Clock className="size-4 shrink-0 text-leaf-600" aria-hidden />
          {slot ? <>Delivery {slot}</> : "Check delivery"}
        </span>
        <span className="flex w-full min-w-0 items-center gap-1 text-[0.8125rem] text-ink-soft">
          <span className="truncate">{location ? `${location.areaName} · ${location.pincode}` : serviceArea}</span>
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </span>
        <span className="sr-only">— change delivery location</span>
      </button>
      <LocationDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function SiteHeader({ settings, serviceArea, whatsappEnabled }: { settings: StoreSettings; serviceArea: string; whatsappEnabled: boolean }) {
  const { count, hydrated, itemsTotal } = useCart();
  const { profile } = useSession();
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
      <div className="container-page flex h-[4.25rem] items-center gap-3 sm:h-[5.25rem] lg:gap-5">
        <Logo name={settings.storeName} logoUrl={settings.logoUrl} tagline={settings.tagline} className="min-w-0" />
        <span aria-hidden className="hidden h-12 w-px shrink-0 bg-line lg:block" />
        <DeliveryBlock serviceArea={serviceArea} />

        <div className="ml-auto hidden flex-1 md:block lg:ml-0">
          <Suspense fallback={<div className="h-12 rounded-xl border border-line bg-white" />}>
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
          <CartButton count={hydrated ? count : 0} total={itemsTotal} whatsappEnabled={whatsappEnabled} />
        </div>
      </div>
      <div className="container-page pb-3 md:hidden">
        <Suspense fallback={<div className="h-11 rounded-xl border border-line bg-white" />}>
          <SearchBox />
        </Suspense>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { ChevronDown, LayoutDashboard, MapPin, Search, ShoppingCart, Sprout, Truck, UserRound, X } from "lucide-react";
import type { StoreSettings } from "@freshbasket/shared";
import { useCart } from "../cart/cart-context";
import { useSession } from "../account/session-context";
import { Logo } from "./logo";
import { LocationDialog } from "./location-dialog";
import { cn } from "../ui/cn";

const NAV = [
  { href: "/", label: "Home", match: (p: string) => p === "/" },
  { href: "/shop", label: "Shop", match: (p: string) => p.startsWith("/shop") || p.startsWith("/category") || p.startsWith("/product") || p === "/categories" },
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
        <p className="hidden items-center gap-2 font-medium text-white/90 md:flex">
          <Sprout className="size-4 text-lime-300" aria-hidden />
          Fresh Vegetables <span aria-hidden className="text-white/40">|</span> Better Health <span aria-hidden className="text-white/40">|</span> Happy You
        </p>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3 md:flex-none md:justify-end">
          {announcement ? (
            <p className="flex min-w-0 items-center gap-2 truncate">
              <Truck className="size-4 shrink-0 text-lime-300" aria-hidden />
              <span className="truncate">{announcement}</span>
            </p>
          ) : null}
          {announcement ? <span aria-hidden className="hidden h-4 w-px bg-white/30 sm:block" /> : null}
          <button type="button" onClick={() => setOpen(true)} className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 font-medium hover:bg-white/10 md:ml-0">
            <MapPin className="size-4 text-lime-300" aria-hidden />
            <span className="max-w-44 truncate">{location ? `Delivering to ${location.areaName}` : serviceArea}</span>
            <ChevronDown className="size-3.5" aria-hidden />
            <span className="sr-only">— check delivery for your PIN code</span>
          </button>
        </div>
      </div>
      <LocationDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

export function SiteHeader({ settings }: { settings: StoreSettings }) {
  const { count, hydrated } = useCart();
  const { profile } = useSession();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 shadow-[0_1px_0_rgb(11_102_35/0.04),0_6px_20px_-16px_rgb(11_102_35/0.35)] backdrop-blur supports-[backdrop-filter]:bg-white/90">
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
            aria-label={profile ? "Your account" : "Sign in"}
            className="inline-flex h-11 items-center gap-2 rounded-full px-2.5 text-ink hover:bg-sage-100 hover:text-forest-800"
          >
            <UserRound className="size-[1.45rem] text-forest-800" />
            <span className="hidden text-[0.9375rem] font-medium xl:inline">Account</span>
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
            <span className="hidden text-[0.9375rem] font-medium xl:inline">Cart</span>
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

function SearchBox() {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [q, setQ] = useState(pathname === "/shop" ? params.get("q") ?? "" : "");

  function submit(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/shop?q=${encodeURIComponent(term)}` : "/shop");
  }

  return (
    <form role="search" onSubmit={submit} className="relative">
      <label htmlFor="site-search" className="sr-only">
        Search vegetables
      </label>
      <input
        id="site-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search for vegetables…"
        className="h-11 w-full rounded-full border border-line bg-sage-50/60 pl-5 pr-20 text-[0.9375rem] text-ink placeholder:text-muted/80 focus:border-leaf-600 focus:bg-white focus:outline-none focus:ring-4 focus:ring-lime-200/70 md:h-12"
        enterKeyHint="search"
        autoComplete="off"
        maxLength={60}
      />
      {q ? (
        <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-11 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-sage-100">
          <X className="size-4" />
        </button>
      ) : null}
      <button type="submit" aria-label="Search" className="absolute right-1.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-forest-800 hover:bg-lime-100">
        <Search className="size-[1.2rem]" />
      </button>
    </form>
  );
}

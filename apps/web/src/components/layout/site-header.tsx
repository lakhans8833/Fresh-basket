"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronDown, MapPin, Search, ShoppingBasket, UserRound, X, LayoutDashboard } from "lucide-react";
import type { Category, StoreSettings } from "@freshbasket/shared";
import { useCart } from "../cart/cart-context";
import { useSession } from "../account/session-context";
import { Logo } from "./logo";
import { LocationDialog } from "./location-dialog";
import { cn } from "../ui/cn";

export function SiteHeader({ settings, categories }: { settings: StoreSettings; categories: Category[] }) {
  const { count, hydrated, location } = useCart();
  const { profile } = useSession();
  const [catOpen, setCatOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!catOpen) return;
    const close = (e: MouseEvent) => {
      if (!catRef.current?.contains(e.target as Node)) setCatOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setCatOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [catOpen]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- close menus on navigation
  useEffect(() => setCatOpen(false), [pathname]);

  const navLink = (href: string, label: string) => (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3 py-2 text-[0.9375rem] font-medium text-ink-soft transition-colors hover:bg-sage-100 hover:text-forest-900",
        pathname === href && "text-forest-900",
      )}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-ivory/92 backdrop-blur-md supports-[backdrop-filter]:bg-ivory/80">
      {settings.announcement ? (
        <div className="bg-forest-900 px-4 py-1.5 text-center text-[0.8125rem] font-medium text-lime-100">{settings.announcement}</div>
      ) : null}
      <div className="container-page flex h-16 items-center gap-3 md:h-[4.5rem] md:gap-6">
        <Logo name={settings.storeName} logoUrl={settings.logoUrl} />

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {navLink("/shop", "Shop")}
          <div className="relative" ref={catRef}>
            <button
              type="button"
              aria-expanded={catOpen}
              aria-haspopup="true"
              onClick={() => setCatOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-[0.9375rem] font-medium text-ink-soft hover:bg-sage-100 hover:text-forest-900"
            >
              Categories <ChevronDown className={cn("size-4 transition-transform", catOpen && "rotate-180")} aria-hidden />
            </button>
            {catOpen ? (
              <div className="absolute left-0 top-full mt-2 w-72 rounded-2xl border border-line bg-white p-2 shadow-[var(--shadow-lift)]">
                <Link href="/shop" className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-sage-50">
                  All vegetables
                </Link>
                {categories.map((c) => (
                  <Link key={c.id} href={`/shop?category=${c.slug}`} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-sage-50">
                    <span className="font-medium text-ink">{c.name}</span>
                    <span className="text-xs text-muted">{c.productCount}</span>
                  </Link>
                ))}
                <Link href="/shop?seasonal=1" className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium text-leaf-600 hover:bg-sage-50">
                  In season now
                </Link>
              </div>
            ) : null}
          </div>
          {navLink("/about", "About us")}
        </nav>

        <div className="ml-auto hidden flex-1 md:block md:max-w-sm lg:max-w-md">
          <Suspense fallback={<div className="h-11 rounded-full border border-line bg-white" />}>
            <SearchBox />
          </Suspense>
        </div>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <button
            type="button"
            onClick={() => setLocOpen(true)}
            className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm text-ink-soft hover:bg-sage-100 xl:inline-flex"
          >
            <MapPin className="size-4 text-leaf-600" aria-hidden />
            {location ? (
              <span className="max-w-36 truncate">
                <span className="text-muted">Deliver to</span> <span className="font-semibold text-ink">{location.areaName}</span>
              </span>
            ) : (
              <span>Check delivery</span>
            )}
          </button>
          {profile && profile.role !== "customer" ? (
            <Link href="/admin" aria-label="Admin dashboard" className="hidden size-11 place-items-center rounded-full text-forest-800 hover:bg-sage-100 sm:grid">
              <LayoutDashboard className="size-[1.35rem]" />
            </Link>
          ) : null}
          <Link
            href={profile ? "/account" : "/login"}
            aria-label={profile ? "Your account" : "Sign in"}
            className="grid size-11 place-items-center rounded-full text-forest-800 hover:bg-sage-100"
          >
            <UserRound className="size-[1.4rem]" />
          </Link>
          <Link href="/cart" aria-label={`Basket, ${count} item${count === 1 ? "" : "s"}`} className="relative grid size-11 place-items-center rounded-full text-forest-800 hover:bg-sage-100">
            <ShoppingBasket className="size-[1.45rem]" />
            {hydrated && count > 0 ? (
              <span className="absolute right-0.5 top-0.5 grid min-w-5 place-items-center rounded-full bg-tomato px-1 text-[0.6875rem] font-bold leading-5 text-white ring-2 ring-ivory">
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </Link>
        </div>
      </div>
      <div className="container-page flex items-center gap-2 pb-3 md:hidden">
        <div className="flex-1">
          <Suspense fallback={<div className="h-11 rounded-full border border-line bg-white" />}>
            <SearchBox />
          </Suspense>
        </div>
        <button type="button" onClick={() => setLocOpen(true)} aria-label="Delivery location" className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-white text-leaf-600">
          <MapPin className="size-5" />
        </button>
      </div>
      <LocationDialog open={locOpen} onClose={() => setLocOpen(false)} />
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
    const sp = new URLSearchParams(pathname === "/shop" ? params.toString() : "");
    if (q.trim()) sp.set("q", q.trim());
    else sp.delete("q");
    router.push(`/shop${sp.toString() ? `?${sp}` : ""}`);
  }

  return (
    <form role="search" onSubmit={submit} className="relative">
      <label htmlFor="site-search" className="sr-only">
        Search vegetables
      </label>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[1.1rem] -translate-y-1/2 text-muted" aria-hidden />
      <input
        id="site-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search for vegetables, e.g. tomato, carrot…"
        className="h-11 w-full rounded-full border border-line bg-white pl-10 pr-10 text-sm text-ink placeholder:text-muted/80 focus:border-leaf-500 focus:outline-none focus:ring-4 focus:ring-lime-200/70"
        enterKeyHint="search"
        autoComplete="off"
      />
      {q ? (
        <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-sage-100">
          <X className="size-4" />
        </button>
      ) : null}
    </form>
  );
}

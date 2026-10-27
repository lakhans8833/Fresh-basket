"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, ShoppingCart, UserRound } from "lucide-react";
import { useCart } from "../cart/cart-context";
import { useSession } from "../account/session-context";
import { cn } from "../ui/cn";

const TABS = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { href: "/shop", label: "Shop", icon: LayoutGrid, match: (p: string) => p.startsWith("/shop") || p.startsWith("/category") || p.startsWith("/categories") || p.startsWith("/product") || p === "/deals" },
  { href: "/cart", label: "Cart", icon: ShoppingCart, match: (p: string) => p === "/cart" || p === "/order" },
  { href: "/account", label: "Account", icon: UserRound, match: (p: string) => p.startsWith("/account") || p.startsWith("/orders") || p === "/login" || p === "/wishlist" },
] as const;

/** Bottom navigation on small screens: Home, Shop, Cart (with item count), Account. */
export function MobileTabBar() {
  const pathname = usePathname();
  const { count, hydrated } = useCart();
  const { profile } = useSession();
  if (pathname.startsWith("/checkout") || pathname.startsWith("/pay")) return null;
  const n = hydrated ? count : 0;
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 print:hidden border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          // Signed out, the account tab is a "Sign in" tab (visible label and accessible name agree).
          // (The profile comes from the server on first render, so there's no signed-out flash.)
          const signIn = tab.href === "/account" && !profile;
          const { icon: Icon, match } = tab;
          const href = signIn ? "/login" : tab.href;
          const label = signIn ? "Sign in" : tab.label;
          const active = match(pathname);
          const isCart = tab.href === "/cart";
          return (
            <li key={tab.href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={isCart ? `Cart, ${n} item${n === 1 ? "" : "s"}` : undefined}
                className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium", active ? "text-forest-800" : "text-muted")}
              >
                <span className="relative">
                  <Icon className={cn("size-[1.35rem]", active && "fill-lime-200")} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                  {isCart && n > 0 ? (
                    <span aria-hidden className="absolute -right-2.5 -top-2 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-offer px-1 text-[0.625rem] font-bold leading-none tabular-nums text-white">
                      {n > 99 ? "99+" : n}
                    </span>
                  ) : null}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

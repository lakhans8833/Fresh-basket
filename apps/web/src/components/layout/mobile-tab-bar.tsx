"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, ShoppingBag, UserRound } from "lucide-react";
import { cn } from "../ui/cn";

const TABS = [
  { href: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  { href: "/categories", label: "Categories", icon: LayoutGrid, match: (p: string) => p.startsWith("/categories") || p.startsWith("/shop") },
  { href: "/account/orders", label: "Orders", icon: ShoppingBag, match: (p: string) => p.startsWith("/account/orders") || p.startsWith("/orders") },
  { href: "/account", label: "Profile", icon: UserRound, match: (p: string) => p === "/account" || p.startsWith("/account/addresses") || p === "/login" },
];

/** Bottom navigation on small screens, matching the app design. */
export function MobileTabBar() {
  const pathname = usePathname();
  if (pathname.startsWith("/checkout") || pathname.startsWith("/pay")) return null;
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="grid grid-cols-4">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? "page" : undefined} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium", active ? "text-forest-800" : "text-muted")}>
                <Icon className={cn("size-[1.35rem]", active && "fill-lime-200")} strokeWidth={active ? 2.2 : 1.8} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

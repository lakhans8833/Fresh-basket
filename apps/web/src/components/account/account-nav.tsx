"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Heart, LayoutDashboard, LogOut, MapPin, Package, UserRound } from "lucide-react";
import { useSession } from "./session-context";
import { Spinner } from "../ui/feedback";
import { cn } from "../ui/cn";

const LINKS = [
  { href: "/account", label: "Profile", icon: UserRound, match: (p: string) => p === "/account" },
  { href: "/account/orders", label: "Orders", icon: Package, match: (p: string) => p.startsWith("/account/orders") },
  { href: "/account/addresses", label: "Addresses", icon: MapPin, match: (p: string) => p.startsWith("/account/addresses") },
  { href: "/wishlist", label: "Saved items", icon: Heart, match: (p: string) => p === "/wishlist" },
];

const item =
  "inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors md:flex md:w-full md:rounded-xl md:px-3.5 md:py-2.5";

/** Account navigation: horizontal pills on mobile, a side list on larger screens. */
export function AccountNav({ isStaff }: { isStaff: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await logout();
    router.replace("/");
    router.refresh();
  }

  return (
    <nav aria-label="Account" className="-mx-4 md:sticky md:top-24 md:mx-0">
      <ul className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1 md:flex-col md:gap-1 md:overflow-visible md:rounded-[var(--radius-card)] md:border md:border-line md:bg-white md:p-2">
        {LINKS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  item,
                  active
                    ? "bg-forest-800 text-white md:bg-lime-100 md:text-forest-900"
                    : "border border-line bg-white text-ink-soft hover:bg-sage-50 md:border-transparent md:bg-transparent",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
        {isStaff ? (
          <li>
            <Link href="/admin" className={cn(item, "border border-line bg-white text-ink-soft hover:bg-sage-50 md:border-transparent md:bg-transparent")}>
              <LayoutDashboard className="size-4" aria-hidden />
              Admin dashboard
            </Link>
          </li>
        ) : null}
        <li className="md:mt-1 md:border-t md:border-line md:pt-1">
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className={cn(item, "border border-line bg-white text-ink-soft hover:bg-danger-bg hover:text-danger disabled:opacity-60 md:border-transparent md:bg-transparent")}
          >
            {signingOut ? <Spinner className="size-4" /> : <LogOut className="size-4" aria-hidden />}
            Sign out
          </button>
        </li>
      </ul>
    </nav>
  );
}

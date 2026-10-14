"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard, ClipboardList, Package, FolderTree, Boxes, Truck, TicketPercent, MessageSquare, Settings, ExternalLink, LogOut, Menu, X, GalleryHorizontalEnd } from "lucide-react";
import { useSession } from "../account/session-context";
import { LeafMark } from "../layout/logo";
import { DevBadge } from "../ui/feedback";
import { cn } from "../ui/cn";
import { AdminProvider, type AdminRole } from "./admin-context";

const NAV: { href: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList },
  { href: "/admin/products", label: "Products", icon: Package, adminOnly: true },
  { href: "/admin/categories", label: "Categories", icon: FolderTree, adminOnly: true },
  { href: "/admin/banners", label: "Banners", icon: GalleryHorizontalEnd, adminOnly: true },
  { href: "/admin/inventory", label: "Inventory", icon: Boxes },
  { href: "/admin/delivery", label: "Delivery", icon: Truck, adminOnly: true },
  { href: "/admin/coupons", label: "Coupons", icon: TicketPercent, adminOnly: true },
  { href: "/admin/messages", label: "Messages", icon: MessageSquare },
  { href: "/admin/settings", label: "Settings", icon: Settings, adminOnly: true },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

function Brand({ storeName, onDark }: { storeName: string; onDark?: boolean }) {
  return (
    <Link href="/admin" className="inline-flex items-center gap-2" aria-label={`${storeName} admin — dashboard`}>
      <LeafMark className={cn("size-8 shrink-0", onDark ? "text-lime-300" : "text-leaf-500")} />
      <span className="leading-tight">
        <span className={cn("block font-display text-[1.15rem] font-semibold lowercase tracking-[-0.03em]", onDark ? "text-ivory" : "text-forest-900")}>{storeName}.</span>
        <span className={cn("block text-[0.625rem] font-semibold uppercase tracking-[0.18em]", onDark ? "text-lime-200/80" : "text-muted")}>Admin</span>
      </span>
    </Link>
  );
}

export function AdminShell({
  children, role, storeName, userName, userEmail, devNotes,
}: { children: ReactNode; role: AdminRole; storeName: string; userName: string; userEmail: string | null; devNotes: string[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useSession();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const items = NAV.filter((n) => role === "admin" || !n.adminOnly);

  // Close the mobile menu after navigating.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- close menu on route change
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    await logout();
    router.replace("/login");
    router.refresh();
  }

  const nav = (
    <nav aria-label="Admin" className="flex flex-col gap-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9375rem] font-medium transition-colors",
              active ? "bg-lime-200 text-forest-900" : "text-ivory/80 hover:bg-white/8 hover:text-ivory",
            )}
          >
            <Icon className={cn("size-[1.15rem] shrink-0", active ? "text-forest-800" : "text-lime-200/70 group-hover:text-lime-200")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="space-y-3 border-t border-white/10 pt-4">
      <a href="/" target="_blank" rel="noopener" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-ivory/80 hover:bg-white/8 hover:text-ivory">
        <ExternalLink className="size-4 text-lime-200/70" aria-hidden /> View store <span className="sr-only">(opens in a new tab)</span>
      </a>
      <div className="flex items-center gap-3 rounded-xl bg-white/6 px-3 py-2.5">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-lime-300 font-semibold text-forest-900">
          {(userName || userEmail || "?").trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ivory">{userName || userEmail}</p>
          <p className="truncate text-xs text-ivory/60"><span className="capitalize">{role}</span>{userEmail && userName ? ` · ${userEmail}` : ""}</p>
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="grid size-9 shrink-0 place-items-center rounded-full text-ivory/75 hover:bg-white/10 hover:text-ivory disabled:opacity-50"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );

  return (
    <AdminProvider value={{ role, storeName, devMode: devNotes.length > 0 }}>
      <div className="min-h-dvh bg-ivory lg:grid lg:grid-cols-[16.5rem_1fr]">
        {/* Desktop sidebar */}
        <div className="hidden bg-forest-900 lg:block print:hidden">
        <aside className="sticky top-0 flex h-dvh flex-col gap-6 overflow-y-auto px-4 py-6">
          <div className="px-2">
            <Brand storeName={storeName} onDark />
            {devNotes.length ? <DevBadge className="mt-3" >Dev mode</DevBadge> : null}
          </div>
          <div className="flex-1">{nav}</div>
          {footer}
        </aside>
        </div>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-line bg-ivory/95 px-4 backdrop-blur lg:hidden print:hidden">
          <Brand storeName={storeName} />
          <div className="flex items-center gap-2">
            {devNotes.length ? <DevBadge>Dev</DevBadge> : null}
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-controls="admin-mobile-nav"
              className="grid size-10 place-items-center rounded-full text-forest-900 hover:bg-sage-100"
              aria-label="Open menu"
            >
              <Menu className="size-5" aria-hidden />
            </button>
          </div>
        </header>

        {open ? (
          <div className="fixed inset-0 z-50 lg:hidden" id="admin-mobile-nav" role="dialog" aria-modal="true" aria-label="Admin menu">
            <button type="button" aria-label="Close menu" className="absolute inset-0 bg-forest-950/50" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-[min(19rem,85vw)] flex-col gap-6 overflow-y-auto bg-forest-900 px-4 py-5 shadow-[var(--shadow-lift)]">
              <div className="flex items-center justify-between px-2">
                <Brand storeName={storeName} onDark />
                <button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full text-ivory hover:bg-white/10" aria-label="Close menu" autoFocus>
                  <X className="size-5" aria-hidden />
                </button>
              </div>
              <div className="flex-1">{nav}</div>
              {footer}
            </div>
          </div>
        ) : null}

        <div className="min-w-0">
          {devNotes.length ? (
            <div className="border-b border-[#f0d9a6] bg-[#fdf6e7] px-4 py-1.5 text-center text-xs font-medium text-[#7a5212] print:hidden">
              Development mode: {devNotes.join(" · ")}
            </div>
          ) : null}
          <main id="main" className="mx-auto w-full max-w-[84rem] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
            {children}
          </main>
        </div>
      </div>
    </AdminProvider>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard, ClipboardList, Package, FolderTree, Boxes, Truck, TicketPercent, MessageSquare, Settings, ExternalLink, LogOut, Menu, X, GalleryHorizontalEnd, UsersRound, Star } from "lucide-react";
import { LEAVE_HELD_EVENT, requestLeave } from "./unsaved-guard";
import { useSession } from "../account/session-context";
import { BasketMark } from "../layout/logo";
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
  { href: "/admin/reviews", label: "Reviews", icon: Star, adminOnly: true },
  { href: "/admin/users", label: "Users", icon: UsersRound, adminOnly: true },
  { href: "/admin/settings", label: "Settings", icon: Settings, adminOnly: true },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

function Brand({ storeName, onDark }: { storeName: string; onDark?: boolean }) {
  return (
    <Link href="/admin" className="inline-flex items-center gap-2" aria-label={`${storeName} admin — dashboard`}>
      <BasketMark className={cn("size-9 shrink-0", onDark && "opacity-95")} />
      <span className="min-w-0 leading-tight">
        <span className="block font-brand text-[1rem] font-bold leading-tight text-forest-800">{storeName}</span>
        <span className="block text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-muted">Admin panel</span>
      </span>
    </Link>
  );
}

export function AdminShell({
  children, role, storeName, userName, userEmail, devNotes,
}: { children: ReactNode; role: AdminRole; storeName: string; userName: string; userEmail: string | null; devNotes: string[] }) {
  const pathname = usePathname();
  const { logout } = useSession();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const items = NAV.filter((n) => role === "admin" || !n.adminOnly);

  // Close the mobile menu after navigating.
  // The admin panel has no shop header: no extra scroll offset for in-page links here.
  useEffect(() => {
    document.documentElement.style.setProperty("--header-h", "0px");
    return () => { document.documentElement.style.removeProperty("--header-h"); };
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- close menu on route change
  useEffect(() => setOpen(false), [pathname]);
  // A link tapped in the menu was held back by an unsaved-changes prompt: close the menu so the
  // prompt (and, after "Stay", the form) isn't hidden behind it.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener(LEAVE_HELD_EVENT, close);
    return () => window.removeEventListener(LEAVE_HELD_EVENT, close);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function signOut() {
    // Unsaved edits on this page? Ask first (Save / Discard / Stay) — before the session ends.
    requestLeave(async () => {
      setSigningOut(true);
      try {
        await logout();
        // Full page load so nothing from the signed-in panel stays on screen.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload clears the signed-in panel
        window.location.assign("/admin/login");
      } catch {
        setSigningOut(false);
      }
    });
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
              "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.9375rem] font-medium transition-colors",
              active ? "bg-leaf-600 text-white shadow-sm" : "text-ink-soft hover:bg-sage-100 hover:text-forest-800",
            )}
          >
            <Icon className={cn("size-[1.15rem] shrink-0", active ? "text-white" : "text-forest-700/70 group-hover:text-forest-800")} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="space-y-3 border-t border-line pt-4">
      <a href="/" target="_blank" rel="noopener" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-soft hover:bg-sage-100 hover:text-forest-800">
        <ExternalLink className="size-4 text-forest-700/70" aria-hidden /> View store <span className="sr-only">(opens in a new tab)</span>
      </a>
      <div className="flex items-center gap-3 rounded-xl bg-sage-50 px-3 py-2.5">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-leaf-600 font-semibold text-white">
          {(userName || userEmail || "?").trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{userName || userEmail}</p>
          <p className="truncate text-xs text-muted"><span className="capitalize">{role}</span>{userEmail && userName ? ` · ${userEmail}` : ""}</p>
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="grid size-9 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-white hover:text-danger disabled:opacity-50"
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
      <div className="min-h-dvh bg-sage-50 lg:grid lg:grid-cols-[16.5rem_1fr]">
        {/* Desktop sidebar */}
        <div className="hidden border-r border-line bg-white lg:block print:hidden">
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
        <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-line bg-white/95 px-4 backdrop-blur lg:hidden print:hidden">
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
            <div className="absolute inset-y-0 left-0 flex w-[min(19rem,85vw)] flex-col gap-6 overflow-y-auto bg-white px-4 py-5 shadow-[var(--shadow-lift)]">
              <div className="flex items-center justify-between px-2">
                <Brand storeName={storeName} onDark />
                <button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full text-ink hover:bg-sage-100" aria-label="Close menu" autoFocus>
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
          <main id="main" tabIndex={-1} className="focus:outline-none mx-auto w-full max-w-[84rem] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
            {children}
          </main>
        </div>
      </div>
    </AdminProvider>
  );
}

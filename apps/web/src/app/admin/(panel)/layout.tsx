import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getSession, PATH_HEADER } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-next";
import { getSettings } from "@/lib/settings";
import { env } from "@/lib/env";
import { AdminShell } from "@/components/admin/admin-shell";
import { LeafMark } from "@/components/layout/logo";
import { buttonClass } from "@/components/ui/button";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession().catch(() => null);
  if (!session) {
    // The proxy passes the requested path so staff come back to the same page after signing in.
    const path = (await headers()).get(PATH_HEADER);
    const safe = safeNextPath(path, "/admin");
    const next = safe.startsWith("/admin") ? safe : "/admin";
    redirect(`/admin/login?next=${encodeURIComponent(next)}`);
  }

  const { profile } = session;
  if (profile.role !== "admin" && profile.role !== "staff") {
    return (
      <main id="main" tabIndex={-1} className="grid min-h-dvh place-items-center bg-ivory px-4 py-12 focus:outline-none">
        <div className="w-full max-w-md rounded-[var(--radius-card)] border border-line bg-white p-8 text-center shadow-[var(--shadow-card)]">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-lime-100 text-forest-700">
            <ShieldAlert className="size-7" aria-hidden />
          </span>
          <p className="eyebrow mt-5">Error 403</p>
          <h1 className="mt-1 text-2xl font-semibold text-forest-900">This area is for store staff</h1>
          <p className="mt-2 text-[0.9375rem] text-muted">
            You&apos;re signed in as {profile.email ?? "a customer"}, which doesn&apos;t have access to the admin panel. If you work at the store, ask an
            admin to give your account staff access.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link href="/" className={buttonClass("primary")}>
              <LeafMark className="size-4" /> Back to the store
            </Link>
            <Link href="/admin/login" className={buttonClass("outline")}>Use a staff account</Link>
          </div>
        </div>
      </main>
    );
  }

  const settings = await getSettings();
  const devNotes = [
    env.auth.mode === "dev" && "development login",
    env.payments.online === "mock" && "test payments (no real money)",
    env.storage.mode === "local" && "uploads stored on this machine",
  ].filter((x): x is string => Boolean(x));

  return (
    <AdminShell
      role={profile.role}
      storeName={settings.storeName}
      userName={profile.fullName ?? ""}
      userEmail={profile.email}
      devNotes={devNotes}
    >
      {children}
    </AdminShell>
  );
}

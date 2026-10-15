import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/safe-next";
import { AdminLoginForm } from "@/components/admin/admin-login-form";
import { AdminAuthFrame } from "@/components/admin/admin-auth-frame";

export const metadata: Metadata = { title: "Staff sign in" };

function safeNext(n: string | undefined) {
  const p = safeNextPath(n, "/admin");
  return /^\/admin(\/|$|\?)/.test(p) && !p.startsWith("/admin/login") ? p : "/admin";
}

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const [session, settings] = await Promise.all([getSession().catch(() => null), getSettings()]);
  // Already signed in with staff access: straight to the panel. A signed-in customer sees the form.
  if (session && (session.profile.role === "admin" || session.profile.role === "staff")) redirect(next);
  return (
    <AdminAuthFrame storeName={settings.storeName}>
      <AdminLoginForm mode={env.auth.mode} next={next} signedInAs={session?.profile.email ?? null} />
    </AdminAuthFrame>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { api } from "@/lib/client/api";
import { getBrowserSupabase } from "@/lib/client/supabase";
import { useSession } from "../account/session-context";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/form";
import { DevBadge, Notice } from "../ui/feedback";

const NO_ACCESS = "This account doesn't have admin access. Ask the store admin to give it the Staff or Admin role.";

/**
 * Staff sign-in: email + password only (no sign-up, no email codes). Customers who try it are
 * signed out again straight away, so a customer session never lingers on the admin screens.
 */
export function AdminLoginForm({ mode, next, signedInAs }: { mode: "supabase" | "dev" | "unconfigured"; next: string; signedInAs: string | null }) {
  const { refresh, logout } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    const p = await refresh();
    if (!p || (p.role !== "admin" && p.role !== "staff")) {
      await logout();
      setError(NO_ACCESS);
      setPassword("");
      setBusy(false);
      return;
    }
    // Full page load: the panel layout is rendered on the server with the new session.
    window.location.assign(next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (mode === "dev") {
        await api("/api/auth/dev-login", { method: "POST", json: { email } });
      } else {
        const sb = getBrowserSupabase();
        if (!sb) throw new Error("Sign-in isn't configured on this server.");
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
      await finish();
    } catch (err) {
      const raw = (err as Error).message || "";
      setError(
        /invalid login credentials/i.test(raw) ? "Email or password is incorrect."
        : /email not confirmed/i.test(raw) ? "This email isn't confirmed yet. Open the confirmation email, or ask an admin to confirm it in Admin → Users."
        : /rate|too many/i.test(raw) ? "Too many attempts. Please wait a minute and try again."
        : raw || "Sign in failed. Please try again.",
      );
      setBusy(false);
    }
  }

  return (
    <>
      <span className="grid size-12 place-items-center rounded-full bg-lime-100 text-forest-800">
        <LockKeyhole className="size-6" aria-hidden />
      </span>
      <h1 className="mt-4 text-[1.6rem] font-semibold leading-tight text-forest-900">Staff sign in</h1>
      <p className="mt-1 text-sm text-muted">For store staff and admins. Shopping? Use the store&apos;s sign-in instead.</p>

      {signedInAs && !error ? (
        <Notice tone="warning" className="mt-5">You&apos;re signed in as {signedInAs}, which doesn&apos;t have admin access. Sign in with a staff account.</Notice>
      ) : null}
      {error ? <Notice tone="error" className="mt-5">{error}</Notice> : null}
      {mode === "unconfigured" ? <Notice tone="error" className="mt-5">Sign-in isn&apos;t configured on this server.</Notice> : null}

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate={false}>
        <Field label="Email" htmlFor="admin-email">
          <Input id="admin-email" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {mode !== "dev" ? (
          <Field label="Password" htmlFor="admin-password">
            <Input id="admin-password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        ) : null}
        <Button type="submit" variant="dark" size="lg" className="w-full" loading={busy} disabled={mode === "unconfigured"}>
          Sign in
        </Button>
      </form>
      {mode === "dev" ? (
        <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
          <DevBadge /> No password needed in development. Try admin@freshbasket.local.
        </p>
      ) : (
        <p className="mt-4 text-xs text-muted">Forgot your password? Ask the store admin to send a reset, or use “Forgot password?” on the store sign-in page.</p>
      )}
    </>
  );
}

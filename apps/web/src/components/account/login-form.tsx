"use client";

import Link from "next/link";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { KeyRound, Mail, ShieldCheck, UserRound, Store } from "lucide-react";
import { api } from "@/lib/client/api";
import { getBrowserSupabase } from "@/lib/client/supabase";
import { useSession } from "./session-context";
import { OtpLogin } from "./otp-login";
import { SignupCode } from "./signup-code";
import { sendErrorMessage } from "@/lib/client/otp-errors";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/form";
import { DevBadge, Notice } from "../ui/feedback";
import { LeafMark } from "../layout/logo";
import { cn } from "../ui/cn";

const LINK_ERRORS: Record<"expired" | "device" | "link", string> = {
  expired: "That email link has expired or was already used. Each link works once — request a new one below (sign-in code, magic link or Forgot password).",
  device: "Open the email link in the same browser where you asked for it — or sign in below with your password or an email code.",
  link: "That sign-in link didn't work. Please request a new one below.",
};

export function LoginForm({ mode, next, linkError, signedInAs = null }: { mode: "supabase" | "dev" | "unconfigured"; next: string; linkError?: "expired" | "device" | "link"; signedInAs?: string | null }) {
  const router = useRouter();
  const { refresh } = useSession();
  const [method, setMethod] = useState<"code" | "password">("code");
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(linkError ? LINK_ERRORS[linkError] : null);
  const [info, setInfo] = useState<string | null>(null);
  const [lastError, setLastError] = useState<"credentials" | "unconfirmed" | null>(null);
  /** Password account waiting for its email code: just signed up, or tried to sign in unconfirmed. */
  const [confirming, setConfirming] = useState<{ email: string; justSent: boolean } | null>(null);

  /** Signed in, but loading the account failed (network / server): retry the check, keep the session. */
  const [checkFailed, setCheckFailed] = useState(false);
  /** The error shown comes from the post-sign-in check (always visible, whatever the sign-in method). */
  const [sessionProblem, setSessionProblem] = useState(false);

  /**
   * After signing in: continue only once the server confirms the session. A failed check keeps the
   * session and offers a retry; "no session after all" asks to sign in again. Never navigates silently.
   */
  async function done() {
    setError(null);
    setSessionProblem(false);
    const r = await refresh();
    if (r.status === "signed_in") {
      setCheckFailed(false);
      // Customers' sign-in never jumps into Admin; staff sign in at /admin/login.
      router.replace(next);
      router.refresh();
      return;
    }
    if (r.status === "signed_out") {
      setCheckFailed(false);
      setError("Sign-in didn't complete. Please try again.");
      setSessionProblem(true);
    } else {
      setSessionProblem(true);
      setCheckFailed(true);
      setError("You're signed in, but we couldn't load your account just now (connection or server problem). Please try again.");
    }
    setBusy(null);
  }

  async function devLogin(e?: FormEvent, preset?: { email: string; name: string }) {
    e?.preventDefault();
    setError(null);
    setBusy(preset?.email ?? "form");
    try {
      await api("/api/auth/dev-login", { method: "POST", json: preset ?? { email, name: name || undefined } });
      await done();
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  }

  async function supabaseSubmit(e: FormEvent) {
    e.preventDefault();
    const sb = getBrowserSupabase();
    if (!sb) return;
    setError(null);
    setInfo(null);
    setBusy("form");
    try {
      if (tab === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await done();
      } else {
        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: { data: { full_name: name }, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) throw error;
        if (data.session) await done();
        else if (data.user && data.user.identities && data.user.identities.length === 0) {
          // Supabase's answer for an email that already has a confirmed account (no email is sent).
          setError("An account with this email already exists. Sign in instead, or use “Forgot password?”.");
          setBusy(null);
        } else {
          setConfirming({ email: email.trim(), justSent: true });
          setBusy(null);
        }
      }
    } catch (err) {
      const raw = (err as Error).message || "";
      if (/invalid login credentials/i.test(raw)) {
        setLastError("credentials");
        setError("Email or password is incorrect. Use “Forgot password?” below, or sign in with an email code instead — no password needed.");
      } else if (/email not confirmed/i.test(raw)) {
        setLastError("unconfirmed");
        setConfirming({ email: email.trim(), justSent: false });
      } else if (/already registered/i.test(raw)) {
        setError("An account with this email already exists. Sign in instead, or use “Forgot password?”.");
      } else {
        setError(/fetch|network/i.test(raw) || (err as { status?: number }).status === 0 ? sendErrorMessage(err as Error) : raw || "Sign in failed. Please try again.");
      }
      setBusy(null);
    }
  }

  /** Emails a link to set a new password; the link lands on /reset-password via /auth/callback. */
  async function forgotPassword() {
    const sb = getBrowserSupabase();
    if (!sb) return;
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter your email above first, then tap “Forgot password?”.");
      return;
    }
    setError(null);
    setInfo(null);
    setBusy("forgot");
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
    });
    setBusy(null);
    if (error) setError(/rate|seconds/i.test(error.message) ? "Please wait a minute before asking for another email." : error.message);
    // Same message whether or not the account exists, so nobody can probe which emails are registered.
    else setInfo(`If an account exists for ${email}, we've emailed a link to set a new password. Check your inbox (and spam).`);
  }

  async function resendConfirmation() {
    const sb = getBrowserSupabase();
    if (!sb || !email) return;
    setBusy("resend");
    const { error } = await sb.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(null);
    if (error) setError(/rate|seconds/i.test(error.message) ? "Please wait a minute before asking for another email." : error.message);
    else {
      setError(null);
      setInfo(`Confirmation email sent to ${email}. Open the link in it, then sign in.`);
    }
  }

  return (
    <div className="w-full max-w-md rounded-[1.75rem] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-lime-100"><LeafMark className="size-7 text-leaf-500" /></span>
        <div>
          <h1 className="text-[1.75rem] font-semibold leading-tight text-forest-900">{mode === "supabase" && method === "password" && tab === "signup" ? "Create your account" : "Welcome back"}</h1>
          <p className="text-sm text-muted">Sign in to check out and track your orders.</p>
        </div>
      </div>

      {error && (sessionProblem || !(mode === "supabase" && method === "code" && !linkError)) ? <Notice tone="error" className="mt-5">{error}</Notice> : null}
      {checkFailed ? (
        <Button type="button" variant="outline" className="mt-3 w-full" loading={busy === "check"} onClick={() => { setBusy("check"); void done(); }}>
          Try again
        </Button>
      ) : null}
      {signedInAs ? (
        <Notice tone="info" className="mt-3" title={`You're still signed in as ${signedInAs}`}>
          The email link didn&apos;t sign you in to another account, and nothing about {signedInAs} changed.{" "}
          <Link href={next.startsWith("/reset-password") ? "/account" : next} className="font-semibold underline">Continue as {signedInAs}</Link>
        </Notice>
      ) : null}
      {info && !(mode === "supabase" && method === "code") ? <Notice tone="success" className="mt-5">{info}</Notice> : null}

      {mode === "dev" ? (
        <div className="mt-6 space-y-5">
          <Notice tone="warning" title="Development login">
            Supabase Auth isn&apos;t configured, so you can sign in with just an email. This is disabled in production.
          </Notice>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Button variant="outline" loading={busy === "customer@freshbasket.local"} onClick={() => devLogin(undefined, { email: "customer@freshbasket.local", name: "Test Customer (dev)" })}>
              <UserRound className="size-4" aria-hidden /> Sample customer
            </Button>
            <Button variant="outline" loading={busy === "admin@freshbasket.local"} onClick={() => devLogin(undefined, { email: "admin@freshbasket.local", name: "Store Admin (dev)" })}>
              <Store className="size-4" aria-hidden /> Sample admin
            </Button>
          </div>
          <div className="relative text-center text-xs text-muted before:absolute before:inset-x-0 before:top-1/2 before:h-px before:bg-line"><span className="relative bg-white px-3">or any email</span></div>
          <form onSubmit={devLogin} className="space-y-4">
            <Field label="Email" htmlFor="dev-email">
              <Input id="dev-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Name (optional)" htmlFor="dev-name">
              <Input id="dev-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Button type="submit" variant="dark" size="lg" className="w-full" loading={busy === "form"}>Continue</Button>
          </form>
          <DevBadge />
        </div>
      ) : mode === "supabase" ? (
        <>
          <div role="tablist" aria-label="How to sign in" className="mt-6 grid grid-cols-2 rounded-full bg-sage-100 p-1 text-sm font-semibold">
            {([["code", "Email code", Mail], ["password", "Password", KeyRound]] as const).map(([m, label, Icon]) => (
              <button key={m} role="tab" type="button" aria-selected={method === m} onClick={() => { setMethod(m); setError(null); setInfo(null); }} className={cn("inline-flex h-10 items-center justify-center gap-1.5 rounded-full", method === m ? "bg-white text-forest-900 shadow-sm" : "text-muted")}>
                <Icon className="size-4" aria-hidden /> {label}
              </button>
            ))}
          </div>
          {method === "code" ? (
            <OtpLogin next={next} onSignedIn={done} />
          ) : confirming ? (
            <SignupCode
              email={confirming.email}
              justSent={confirming.justSent}
              onConfirmed={done}
              onCancel={() => { setConfirming(null); setTab("signin"); setError(null); setInfo(null); }}
            />
          ) : (
          <>
          <div role="tablist" className="mt-4 grid grid-cols-2 rounded-full border border-line p-1 text-sm font-semibold">
            {(["signin", "signup"] as const).map((t) => (
              <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("h-10 rounded-full", tab === t ? "bg-white text-forest-900 shadow-sm" : "text-muted")}>
                {t === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
          <form onSubmit={supabaseSubmit} className="mt-5 space-y-4">
            {tab === "signup" ? (
              <Field label="Full name" htmlFor="name"><Input id="name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
            ) : null}
            <Field label="Email" htmlFor="email"><Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Password" htmlFor="password" hint={tab === "signup" ? "At least 8 characters" : undefined}>
              <Input id="password" type="password" required minLength={tab === "signup" ? 8 : undefined} autoComplete={tab === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Button type="submit" variant="dark" size="lg" className="w-full" loading={busy === "form"}>
              {tab === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
          {tab === "signin" ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <button type="button" onClick={forgotPassword} disabled={busy !== null} className="font-semibold text-forest-800 hover:underline disabled:opacity-60">
                {busy === "forgot" ? "Sending…" : "Forgot password?"}
              </button>
              {lastError === "unconfirmed" ? (
                <button type="button" onClick={resendConfirmation} disabled={busy !== null} className="font-semibold text-forest-800 hover:underline disabled:opacity-60">
                  {busy === "resend" ? "Sending…" : "Resend confirmation email"}
                </button>
              ) : lastError === "credentials" ? (
                <button type="button" onClick={() => { setTab("signup"); setError(null); }} className="font-semibold text-forest-800 hover:underline">
                  New here? Create account
                </button>
              ) : null}
            </div>
          ) : null}
          </>
          )}
          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted"><ShieldCheck className="size-3.5" aria-hidden /> Secured by Supabase Auth</p>
        </>
      ) : (
        <Notice tone="error" className="mt-6" title="Sign-in is not configured">
          Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable accounts.
        </Notice>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { getBrowserSupabase } from "@/lib/client/supabase";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/form";
import { Notice } from "../ui/feedback";

const RESEND_SECONDS = 60;

/**
 * Passwordless sign-in: email → one-time code by email → enter code → signed in.
 * New customers get an account automatically on their first code. The code is checked by
 * Supabase Auth (verifyOtp); nothing about it is stored or checked in this app.
 */
export function OtpLogin({ next, onSignedIn }: { next: string; onSignedIn: () => Promise<void> }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    const sb = getBrowserSupabase();
    if (!sb) return;
    const addr = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(addr)) return setError("Enter a valid email address.");
    setError(null);
    setInfo(null);
    setBusy("send");
    const { error } = await sb.auth.signInWithOtp({
      email: addr,
      options: {
        shouldCreateUser: true,
        data: name.trim() ? { full_name: name.trim() } : undefined,
        // If the email also contains a sign-in link, it lands here and signs in the same way.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(null);
    if (error) {
      const m = error.message;
      const secs = /(\d+)\s*seconds?/i.exec(m)?.[1];
      if (secs) setWait(Number(secs));
      setError(
        /rate|seconds|too many/i.test(m) ? `Too many requests. Please wait${secs ? ` ${secs} seconds` : " a minute"} and try again.`
        : /signups? not allowed|disabled/i.test(m) ? "New sign-ups are turned off for this store. Please contact the store."
        : m,
      );
      return;
    }
    setEmail(addr);
    setCode("");
    setStep("code");
    setWait(RESEND_SECONDS);
    setInfo(`We've emailed a sign-in code to ${addr}. It can take a minute — check spam too.`);
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    const sb = getBrowserSupabase();
    if (!sb) return;
    const token = code.replace(/\D/g, "");
    if (token.length < 6) return setError("Enter the code from the email (6 digits or more).");
    setError(null);
    setBusy("verify");
    const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
    if (error) {
      setBusy(null);
      setError(/expired|invalid/i.test(error.message) ? "That code is wrong or has expired. Check the latest email, or send a new code." : error.message);
      return;
    }
    await onSignedIn();
  }

  if (step === "email") {
    return (
      <form onSubmit={sendCode} className="mt-5 space-y-4">
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Field label="Email" htmlFor="otp-email" hint="We'll email you a one-time code — no password needed.">
          <Input id="otp-email" type="email" required autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Your name (for new accounts)" htmlFor="otp-name">
          <Input id="otp-name" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
        </Field>
        <Button type="submit" variant="dark" size="lg" className="w-full" loading={busy === "send"} disabled={wait > 0}>
          {wait > 0 ? `Send code (wait ${wait}s)` : "Send code"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="mt-5 space-y-4">
      {error ? <Notice tone="error">{error}</Notice> : info ? <Notice tone="success">{info}</Notice> : null}
      <p className="flex items-center gap-2 text-sm text-ink-soft">
        <MailCheck className="size-4 shrink-0 text-forest-800" aria-hidden />
        <span className="min-w-0 truncate">Code sent to <b>{email}</b></span>
      </p>
      <Field label="Enter code" htmlFor="otp-code">
        <Input
          ref={codeRef}
          id="otp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={12}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))}
          className="text-center font-mono text-2xl tracking-[0.4em]"
          placeholder="••••••"
        />
      </Field>
      <Button type="submit" variant="dark" size="lg" className="w-full" loading={busy === "verify"}>Verify &amp; sign in</Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" onClick={() => { setStep("email"); setError(null); setInfo(null); }} className="inline-flex items-center gap-1 font-semibold text-forest-800 hover:underline">
          <ArrowLeft className="size-3.5" aria-hidden /> Change email
        </button>
        <button type="button" onClick={() => sendCode()} disabled={wait > 0 || busy !== null} className="font-semibold text-forest-800 hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline">
          {busy === "send" ? "Sending…" : wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}

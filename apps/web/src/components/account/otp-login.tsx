"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { getBrowserSupabase } from "@/lib/client/supabase";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/form";
import { Notice } from "../ui/feedback";
import { OTP_MAX, OTP_MIN, sendErrorMessage, verifyErrorMessage, waitSeconds } from "@/lib/client/otp-errors";

/** Matches Supabase's default per-email send limit (Auth → Rate Limits); the server's own wait wins. */
const RESEND_SECONDS = 60;

/**
 * Passwordless sign-in: email → one-time code by email → enter code → signed in.
 * New customers get an account automatically on their first code. The code is checked by
 * Supabase Auth (verifyOtp); nothing about it is stored or checked in this app.
 */
export function OtpLogin({ next, onSignedIn }: { next: string; onSignedIn: () => Promise<boolean> }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  /** The code was accepted: keep the form locked while the page moves on (the code can't be reused). */
  const [verified, setVerified] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  /** Blocks a second send / verify while one is in flight (double tap, Enter + click). */
  const inFlight = useRef(false);

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
    if (inFlight.current || wait > 0) return;
    const sb = getBrowserSupabase();
    if (!sb) return setError("Sign-in isn't set up on this website.");
    const addr = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(addr)) return setError("Enter a valid email address.");
    const resend = step === "code";
    inFlight.current = true;
    setError(null);
    setInfo(null);
    setBusy("send");
    try {
      const { error } = await sb.auth.signInWithOtp({
        email: addr,
        options: {
          shouldCreateUser: true,
          data: name.trim() ? { full_name: name.trim() } : undefined,
          // If the email template also has a sign-in link, it lands on /auth/callback (token_hash).
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        const secs = waitSeconds(error);
        if (secs) setWait(secs);
        setError(sendErrorMessage(error));
        return;
      }
      setEmail(addr);
      setCode("");
      setStep("code");
      setWait(RESEND_SECONDS);
      setInfo(
        resend
          ? `New code sent to ${addr}. Use the code from this newest email — earlier codes no longer work.`
          : `We've emailed a sign-in code to ${addr}. It can take a minute — check spam too.`,
      );
    } catch (err) {
      setError(sendErrorMessage(err as Error));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || verified) return;
    const sb = getBrowserSupabase();
    if (!sb) return setError("Sign-in isn't set up on this website.");
    const token = code.replace(/\D/g, "");
    if (token.length < OTP_MIN || token.length > OTP_MAX) return setError(`Enter the ${OTP_MIN}-digit code from the email (some emails have up to ${OTP_MAX} digits).`);
    inFlight.current = true;
    setError(null);
    setBusy("verify");
    try {
      const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
      if (error) {
        setError(verifyErrorMessage(error));
        return;
      }
      setVerified(true);
      setInfo("Signed in. Loading your account…");
      if (!(await onSignedIn())) {
        // The sign-in didn't stick (the page shows why): the code is used up, so start again.
        setVerified(false);
        setInfo(null);
        setCode("");
        setWait(0);
        setStep("email");
      }
    } catch (err) {
      setError(verifyErrorMessage(err as Error));
    } finally {
      // The code is single-use: after a successful sign-in the parent navigates (or shows its own retry).
      inFlight.current = false;
      setBusy(null);
    }
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
      <Field label="Enter code" htmlFor="otp-code" hint="Got a link instead of a code? Open it on this device to finish signing in.">
        <Input
          ref={codeRef}
          id="otp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={OTP_MAX + 4}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ""))}
          className="text-center font-mono text-2xl tracking-[0.4em]"
          placeholder="••••••"
        />
      </Field>
      <Button type="submit" variant="dark" size="lg" className="w-full" loading={busy === "verify"} disabled={busy !== null || verified}>Verify &amp; sign in</Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" disabled={busy !== null || verified} onClick={() => { setStep("email"); setError(null); setInfo(null); setWait(0); }} className="inline-flex items-center gap-1 font-semibold text-forest-800 hover:underline">
          <ArrowLeft className="size-3.5" aria-hidden /> Change email
        </button>
        <button type="button" onClick={() => sendCode()} disabled={wait > 0 || busy !== null || verified} className="font-semibold text-forest-800 hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline">
          {busy === "send" ? "Sending…" : wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}

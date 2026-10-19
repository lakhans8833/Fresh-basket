"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { getBrowserSupabase } from "@/lib/client/supabase";
import { OTP_MAX, OTP_MIN, sendErrorMessage, verifyErrorMessage, waitSeconds } from "@/lib/client/otp-errors";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/form";
import { Notice } from "../ui/feedback";

const RESEND_SECONDS = 60;

/**
 * Confirms a new PASSWORD account with the code from the "Confirm signup" email
 * (verifyOtp type "signup"). Also used when an unconfirmed customer tries to sign in.
 * The email must contain {{ .Token }} — see apps/web/README.md.
 */
export function SignupCode({
  email, justSent, password, onConfirmed, onCancel, onFailed,
}: {
  email: string; justSent: boolean;
  /** The password typed on the sign-up / sign-in form: becomes the account's password once the email is proven. */
  password?: string;
  onConfirmed: () => Promise<boolean>; onCancel: () => void; onFailed: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"verify" | "resend" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(
    justSent ? `We've emailed a code to ${email} to confirm your account. It can take a minute — check spam too.` : null,
  );
  const [wait, setWait] = useState(justSent ? RESEND_SECONDS : 0);
  const [verified, setVerified] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || verified) return;
    const sb = getBrowserSupabase();
    if (!sb) return setError("Sign-in isn't set up on this website.");
    const token = code.replace(/\D/g, "");
    if (token.length < OTP_MIN || token.length > OTP_MAX) return setError(`Enter the ${OTP_MIN}-digit code from the email.`);
    inFlight.current = true;
    setBusy("verify");
    setError(null);
    try {
      const { error } = await sb.auth.verifyOtp({ email, token, type: "signup" });
      if (error) return setError(verifyErrorMessage(error));
      setVerified(true);
      setInfo("Email confirmed. Signing you in…");
      // Whoever proves the inbox owns the account: if the address had an older unconfirmed sign-up
      // (maybe by someone else), Supabase keeps THAT password. Set the one typed now and end any other
      // session of this account.
      if (password && password.length >= 8) {
        await sb.auth.updateUser({ password }).catch(() => undefined);
        await sb.auth.signOut({ scope: "others" }).catch(() => undefined);
      }
      if (!(await onConfirmed())) onFailed();
    } catch (err) {
      setError(verifyErrorMessage(err as Error));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  async function resend() {
    if (inFlight.current || wait > 0) return;
    const sb = getBrowserSupabase();
    if (!sb) return;
    inFlight.current = true;
    setBusy("resend");
    setError(null);
    try {
      const { error } = await sb.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(new URLSearchParams(window.location.search).get("next") ?? "/account")}` },
      });
      if (error) {
        const s = waitSeconds(error);
        if (s) setWait(s);
        return setError(sendErrorMessage(error));
      }
      setCode("");
      setWait(RESEND_SECONDS);
      setInfo(`New code sent to ${email}. Use the code from this newest email — earlier codes no longer work.`);
    } catch (err) {
      setError(sendErrorMessage(err as Error));
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  return (
    <form onSubmit={verify} className="mt-5 space-y-4" aria-labelledby="signup-code-h">
      <h2 id="signup-code-h" className="flex items-center gap-2 font-sans text-base font-semibold text-ink">
        <MailCheck className="size-5 text-forest-800" aria-hidden /> Confirm your email
      </h2>
      {error ? <Notice tone="error">{error}</Notice> : info ? <Notice tone="success">{info}</Notice> : null}
      {!justSent && !error && !info ? (
        <Notice tone="info">This account isn&apos;t confirmed yet. Enter the code from the confirmation email, or send a new one.</Notice>
      ) : null}
      <Field label={`Code sent to ${email}`} htmlFor="signup-code" hint="Got a link instead of a code? Open it on this device to finish signing in.">
        <Input
          id="signup-code"
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
      <Button type="submit" variant="dark" size="lg" className="w-full" loading={busy === "verify"} disabled={busy !== null || verified}>
        Confirm &amp; sign in
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" onClick={onCancel} disabled={busy !== null || verified} className="font-semibold text-forest-800 hover:underline disabled:opacity-60">
          Back
        </button>
        <button type="button" onClick={resend} disabled={wait > 0 || busy !== null || verified} className="font-semibold text-forest-800 hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline">
          {busy === "resend" ? "Sending…" : wait > 0 ? `Resend code in ${wait}s` : "Send a new code"}
        </button>
      </div>
    </form>
  );
}

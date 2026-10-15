"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { getBrowserSupabase } from "@/lib/client/supabase";
import { Button, ButtonLink } from "../ui/button";
import { Field, Input } from "../ui/form";
import { Notice } from "../ui/feedback";

export function ResetPasswordForm({ signedIn, next = "/account" }: { signedIn: boolean; next?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    const sb = getBrowserSupabase();
    if (!sb) return setError("Sign-in isn't set up on this website.");
    setBusy(true);
    setError(null);
    const { error } = await sb.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(/different from the old/i.test(error.message) ? "Choose a password different from your old one." : error.message);
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.replace(next);
      router.refresh();
    }, 1200);
  }

  return (
    <div className="w-full max-w-md rounded-[1.75rem] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
      <div className="flex items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-lime-100 text-forest-800"><KeyRound className="size-6" aria-hidden /></span>
        <div>
          <h1 className="text-[1.75rem] font-semibold leading-tight text-forest-900">Set a new password</h1>
          <p className="text-sm text-muted">Choose a new password for your account.</p>
        </div>
      </div>

      {!signedIn ? (
        <div className="mt-6 space-y-4">
          <Notice tone="warning" title="This link has expired or was already used">
            Ask for a new link from the sign-in page (“Forgot password?”) and open it on this device.
          </Notice>
          <ButtonLink href={next.startsWith("/admin") ? "/admin/login" : "/login"} variant="dark" className="w-full">Back to sign in</ButtonLink>
        </div>
      ) : done ? (
        <Notice tone="success" className="mt-6">Password updated. Taking you to your account…</Notice>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-4">
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Field label="New password" htmlFor="new-password" hint="At least 8 characters">
            <Input id="new-password" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm-password">
            <Input id="confirm-password" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" variant="dark" size="lg" className="w-full" loading={busy}>Save new password</Button>
          <p className="text-center text-sm text-muted"><Link href={next} className="font-semibold text-forest-800 hover:underline">Skip for now</Link></p>
        </form>
      )}
    </div>
  );
}

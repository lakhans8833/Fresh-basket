"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/client/supabase";
import { Button } from "../ui/button";

let enabledCache: Promise<boolean> | null = null;
/** Is Google sign-in switched on in Supabase? (public Auth settings; no secrets involved) */
function googleEnabled(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Promise.resolve(false);
  return (enabledCache ??= fetch(`${url.replace(/\/+$/, "")}/auth/v1/settings`, { headers: { apikey: key } })
    .then((r) => (r.ok ? r.json() : null))
    .then((s: { external?: Record<string, boolean> } | null) => Boolean(s?.external?.google))
    .catch(() => {
      enabledCache = null;
      return false;
    }));
}

/** Google's "G" mark, as its sign-in button guidelines ask for. */
function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * "Continue with Google" — shown only when Google is switched on in Supabase (Authentication →
 * Providers), so it appears by itself once the owner sets it up. Free: no per-sign-in cost.
 * Google sends the customer back to /auth/callback?code=…, which signs them in (PKCE).
 */
export function GoogleSignIn({ next }: { next: string }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void googleEnabled().then((v) => live && setOn(v));
    return () => {
      live = false;
    };
  }, []);
  if (!on) return null;

  async function go() {
    const sb = getBrowserSupabase();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) {
      setBusy(false);
      setError("Couldn't open Google sign-in. Please try again or use an email code.");
    }
    // On success the browser is already going to Google.
  }

  return (
    <div className="mt-6">
      <Button type="button" variant="outline" size="lg" className="w-full gap-2.5 border-line bg-white text-ink hover:bg-sage-50" loading={busy} onClick={go}>
        {!busy ? <GoogleG /> : null} Continue with Google
      </Button>
      {error ? <p className="mt-2 text-sm text-danger" role="alert">{error}</p> : null}
      <p className="mt-4 flex items-center gap-3 text-xs text-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" /> or use your email <span className="h-px flex-1 bg-line" />
      </p>
    </div>
  );
}

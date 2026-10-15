"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/** Browser Supabase client, or null when Supabase isn't configured (development mode). */
export function getBrowserSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // No background refresh in the browser: the server proxy refreshes the session on every request
  // and updates the cookies. Two refreshers racing with one refresh token makes Supabase revoke
  // the session (that logged admins out after ~1 hour).
  client = url && key ? createBrowserClient(url, key, { auth: { autoRefreshToken: false } }) : null;
  return client;
}

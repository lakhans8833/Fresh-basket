"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Profile } from "@freshbasket/shared";
import { api, SESSION_RECOVERED_EVENT, UNAUTHORIZED_EVENT } from "@/lib/client/api";
import { getBrowserSupabase } from "@/lib/client/supabase";

interface SessionState {
  profile: Profile | null;
  loading: boolean;
  refresh: () => Promise<Profile | null>;
  logout: () => Promise<void>;
}
const Ctx = createContext<SessionState>({ profile: null, loading: true, refresh: async () => null, logout: async () => {} });

export function SessionProvider({ children, initial }: { children: ReactNode; initial: Profile | null }) {
  const [profile, setProfile] = useState<Profile | null>(initial);
  const [loading, setLoading] = useState(false);
  const current = useRef(profile);
  useEffect(() => {
    current.current = profile;
  }, [profile]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { profile } = await api<{ profile: Profile | null }>("/api/me", { cache: "no-store" });
      setProfile(profile);
      return profile;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    const { data } = sb.auth.onAuthStateChange((event, session) => {
      // Supabase also reports SIGNED_IN when a tab regains focus; only re-load the profile when
      // the signed-in user actually changed (saves a /api/me round trip on every tab switch).
      if (event === "SIGNED_IN" && session?.user.id === current.current?.id) return;
      if (event === "SIGNED_OUT" && !current.current) return;
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  // Any API 401: re-check the session once (the server proxy refreshes it if it can). If it's really
  // gone, drop the stale profile and send the user to sign in, coming back to this page afterwards.
  useEffect(() => {
    let checking = false;
    const onUnauthorized = async () => {
      if (checking) return;
      checking = true;
      try {
        const p = await refresh();
        if (p) {
          window.dispatchEvent(new Event(SESSION_RECOVERED_EVENT));
          return;
        }
        setProfile(null);
        const { pathname, search } = window.location;
        const isAdmin = /^\/admin(\/|$)/.test(pathname);
        if ((isAdmin || /^\/(account|checkout|orders|pay)(\/|$)/.test(pathname)) && !/^\/(admin\/)?login/.test(pathname)) {
          // Full page load on purpose: the admin sidebar / account header were rendered on the server
          // with the old user, so a client-side push would keep showing them.
          const login = isAdmin ? "/admin/login" : "/login";
          // eslint-disable-next-line @next/next/no-location-assign-relative-destination
          window.location.assign(`${login}?next=${encodeURIComponent(pathname + search)}`);
        }
      } finally {
        setTimeout(() => (checking = false), 3000);
      }
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [refresh]);

  // After signing in, remove PKCE code-verifier cookies left over from earlier sign-in attempts.
  useEffect(() => {
    if (!profile || typeof document === "undefined") return;
    for (const part of document.cookie.split(";")) {
      const name = part.split("=")[0]?.trim();
      if (name && /^sb-.+-auth-token-code-verifier(\.\d+)?$/.test(name)) {
        document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
      }
    }
  }, [profile]);

  const logout = useCallback(async () => {
    await getBrowserSupabase()?.auth.signOut();
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setProfile(null);
  }, []);

  return <Ctx.Provider value={{ profile, loading, refresh, logout }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

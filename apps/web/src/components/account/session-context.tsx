"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Profile } from "@freshbasket/shared";
import { api } from "@/lib/client/api";
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
    const { data } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") void refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const logout = useCallback(async () => {
    await getBrowserSupabase()?.auth.signOut();
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    setProfile(null);
  }, []);

  return <Ctx.Provider value={{ profile, loading, refresh, logout }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

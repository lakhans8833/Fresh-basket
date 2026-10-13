import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@shared/types";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, setAuthHandlers } from "./api";
import { secureStorage } from "./storage";

export type AuthMode = "dev" | "supabase" | "unconfigured";

interface AuthConfigResponse {
  mode: AuthMode;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
}

interface AuthState {
  /** null until /api/auth/config has loaded (or failed) */
  mode: AuthMode | null;
  configError: string | null;
  ready: boolean;
  profile: Profile | null;
  signedIn: boolean;
  devLogin(email: string, name?: string): Promise<void>;
  signInWithPassword(email: string, password: string): Promise<void>;
  signUpWithPassword(email: string, password: string, name?: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  refreshProfile(): Promise<Profile | null>;
  setProfile(p: Profile): void;
  retryConfig(): void;
}

const DEV_TOKEN_KEY = "fb.devToken";
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<AuthMode | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [configAttempt, setConfigAttempt] = useState(0);

  const devToken = useRef<string | null>(null);
  const supabase = useRef<SupabaseClient | null>(null);
  const modeRef = useRef<AuthMode | null>(null);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (modeRef.current === "dev") return devToken.current;
    if (modeRef.current === "supabase" && supabase.current) {
      const { data } = await supabase.current.auth.getSession();
      return data.session?.access_token ?? null;
    }
    return null;
  }, []);

  const clearLocal = useCallback(async () => {
    devToken.current = null;
    await secureStorage.remove(DEV_TOKEN_KEY);
    setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setProfile(null);
      return null;
    }
    try {
      const { profile } = await api<{ profile: Profile }>("/api/me");
      setProfile(profile);
      return profile;
    } catch {
      return null;
    }
  }, [getToken]);

  useEffect(() => {
    setAuthHandlers(getToken, () => {
      // Token rejected by the server: drop the local dev session.
      if (modeRef.current === "dev") void clearLocal();
      else setProfile(null);
    });
  }, [getToken, clearLocal]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      setConfigError(null);
      try {
        const cfg = await api<AuthConfigResponse>("/api/auth/config", { auth: false });
        if (cancelled) return;
        modeRef.current = cfg.mode;
        if (cfg.mode === "dev") {
          devToken.current = await secureStorage.get(DEV_TOKEN_KEY);
        } else if (cfg.mode === "supabase" && cfg.supabaseUrl && cfg.supabaseAnonKey) {
          const { createClient } = await import("@supabase/supabase-js");
          supabase.current = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
            auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
          });
          const { data } = supabase.current.auth.onAuthStateChange((event) => {
            if (event === "SIGNED_OUT") setProfile(null);
          });
          unsubscribe = () => data.subscription.unsubscribe();
        }
        setMode(cfg.mode);
        await refreshProfile();
      } catch (e) {
        if (!cancelled) setConfigError(e instanceof Error ? e.message : "Could not reach the store.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [configAttempt, refreshProfile]);

  const devLogin = useCallback(
    async (email: string, name?: string) => {
      const res = await api<{ profile: Profile; token: string }>("/api/auth/dev-login", {
        method: "POST",
        body: { email: email.trim(), ...(name ? { name } : {}) },
        auth: false,
      });
      devToken.current = res.token;
      await secureStorage.set(DEV_TOKEN_KEY, res.token);
      setProfile(res.profile);
    },
    [],
  );

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      if (!supabase.current) throw new Error("Sign-in is not configured.");
      const { error } = await supabase.current.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw new Error(error.message);
      const p = await refreshProfile();
      if (!p) throw new Error("Signed in, but could not load your profile. Please try again.");
    },
    [refreshProfile],
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string, name?: string) => {
      if (!supabase.current) throw new Error("Sign-up is not configured.");
      const { data, error } = await supabase.current.auth.signUp({
        email: email.trim(),
        password,
        options: name ? { data: { full_name: name } } : undefined,
      });
      if (error) throw new Error(error.message);
      if (!data.session) return { needsConfirmation: true };
      await refreshProfile();
      return { needsConfirmation: false };
    },
    [refreshProfile],
  );

  const signOut = useCallback(async () => {
    if (modeRef.current === "supabase" && supabase.current) {
      await supabase.current.auth.signOut().catch(() => undefined);
    }
    await clearLocal();
  }, [clearLocal]);

  const value = useMemo<AuthState>(
    () => ({
      mode,
      configError,
      ready,
      profile,
      signedIn: profile !== null,
      devLogin,
      signInWithPassword,
      signUpWithPassword,
      signOut,
      refreshProfile,
      setProfile,
      retryConfig: () => setConfigAttempt((n) => n + 1),
    }),
    [mode, configError, ready, profile, devLogin, signInWithPassword, signUpWithPassword, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

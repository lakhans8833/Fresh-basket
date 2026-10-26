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
  /** "app": the store emails sign-in / sign-up codes itself (POST /api/auth/email); otherwise Supabase does. */
  emailCodes?: "app" | "supabase";
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
  /** Passwordless: emails a one-time code (a new customer gets an account on the first code). Free (Supabase email). */
  sendEmailCode(email: string, name?: string): Promise<void>;
  /** Checks the emailed code. "email" = code sign-in, "signup" = confirm a new password account. */
  verifyEmailCode(email: string, code: string, kind: "email" | "signup"): Promise<void>;
  resendSignupCode(email: string): Promise<void>;
  /** True when Google sign-in is switched on in Supabase (the button only shows then). */
  googleEnabled: boolean;
  /** true when signed in; false when the customer closed the Google window. */
  signInWithGoogle(): Promise<boolean>;
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
  const [googleEnabled, setGoogleEnabled] = useState(false);

  const devToken = useRef<string | null>(null);
  const supabase = useRef<SupabaseClient | null>(null);
  const modeRef = useRef<AuthMode | null>(null);
  const codesByApp = useRef(false);

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
        codesByApp.current = cfg.emailCodes === "app";
        if (cfg.mode === "dev") {
          devToken.current = await secureStorage.get(DEV_TOKEN_KEY);
        } else if (cfg.mode === "supabase" && cfg.supabaseUrl && cfg.supabaseAnonKey) {
          const { createClient } = await import("@supabase/supabase-js");
          supabase.current = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
            // PKCE: Google sign-in returns a one-time code to the app, exchanged for a session below.
            auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" },
          });
          // Which sign-in methods are on (public Supabase settings): show "Continue with Google" only when it works.
          fetch(`${cfg.supabaseUrl.replace(/\/+$/, "")}/auth/v1/settings`, { headers: { apikey: cfg.supabaseAnonKey } })
            .then((r) => (r.ok ? r.json() : null))
            .then((st: { external?: Record<string, boolean> } | null) => {
              if (!cancelled) setGoogleEnabled(Boolean(st?.external?.google));
            })
            .catch(() => undefined);
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
      if (codesByApp.current) {
        // The store creates the account and emails the confirmation code itself (SMTP).
        await api("/api/auth/email", { method: "POST", body: { action: "signup", email: email.trim().toLowerCase(), password, name: name ?? null }, auth: false });
        return { needsConfirmation: true };
      }
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

  const sendEmailCode = useCallback(async (email: string, name?: string) => {
    if (!supabase.current) throw new Error("Sign-in is not configured.");
    if (codesByApp.current) {
      await api("/api/auth/email", { method: "POST", body: { action: "signin", email: email.trim().toLowerCase(), name: name ?? null }, auth: false });
      return;
    }
    const { error } = await supabase.current.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true, ...(name ? { data: { full_name: name } } : {}) },
    });
    if (error) throw new Error(friendlyAuthError(error));
  }, []);

  const verifyEmailCode = useCallback(
    async (email: string, code: string, kind: "email" | "signup") => {
      if (!supabase.current) throw new Error("Sign-in is not configured.");
      // Codes emailed by the store are checked as "email" (covers new accounts and confirmations).
      const type = codesByApp.current ? "email" : kind;
      const { error } = await supabase.current.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type });
      if (error) throw new Error(friendlyAuthError(error));
      const p = await refreshProfile();
      if (!p) throw new Error("Signed in, but could not load your profile. Please try again.");
    },
    [refreshProfile],
  );

  const resendSignupCode = useCallback(async (email: string) => {
    if (!supabase.current) throw new Error("Sign-up is not configured.");
    if (codesByApp.current) {
      await api("/api/auth/email", { method: "POST", body: { action: "resend", email: email.trim().toLowerCase() }, auth: false });
      return;
    }
    const { error } = await supabase.current.auth.resend({ type: "signup", email: email.trim().toLowerCase() });
    if (error) throw new Error(friendlyAuthError(error));
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase.current) throw new Error("Sign-in is not configured.");
    const [{ openAuthSessionAsync }, Linking] = await Promise.all([import("expo-web-browser"), import("expo-linking")]);
    const redirectTo = Linking.createURL("auth-callback");
    const { data, error } = await supabase.current.auth.signInWithOAuth({ provider: "google", options: { redirectTo, skipBrowserRedirect: true } });
    if (error || !data?.url) throw new Error(error ? friendlyAuthError(error) : "Could not start Google sign-in.");
    const result = await openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") return false; // closed by the customer: nothing to do
    const back = new URL(result.url);
    const code = back.searchParams.get("code");
    const err = back.searchParams.get("error_description") ?? back.searchParams.get("error");
    if (!code) throw new Error(err ?? "Google sign-in didn't finish. Please try again.");
    const ex = await supabase.current.auth.exchangeCodeForSession(code);
    if (ex.error) throw new Error(friendlyAuthError(ex.error));
    const p = await refreshProfile();
    if (!p) throw new Error("Signed in, but could not load your profile. Please try again.");
    return true;
  }, [refreshProfile]);

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
      sendEmailCode,
      verifyEmailCode,
      resendSignupCode,
      googleEnabled,
      signInWithGoogle,
      signOut,
      refreshProfile,
      setProfile,
      retryConfig: () => setConfigAttempt((n) => n + 1),
    }),
    [mode, configError, ready, profile, devLogin, signInWithPassword, signUpWithPassword, sendEmailCode, verifyEmailCode, resendSignupCode, googleEnabled, signInWithGoogle, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Supabase Auth errors in plain words (rate limits, wrong / expired codes). */
function friendlyAuthError(e: { message: string; code?: string; status?: number }): string {
  const m = `${e.code ?? ""} ${e.message}`.toLowerCase();
  if (e.status === 429 || /rate limit|over_email_send_rate|too many/.test(m)) return "Too many codes requested. Please wait a minute and try again.";
  if (/expired|otp_expired|invalid|token/.test(m)) return "That code is wrong or has expired. Check the latest email or ask for a new code.";
  if (/email not confirmed|email_not_confirmed/.test(m)) return "Please confirm your email first: enter the code we emailed you.";
  return e.message;
}

import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { Chip } from "@/components/Chip";
import { IconButton } from "@/components/IconButton";
import { Logo } from "@/components/Logo";
import { ErrorState, InlineMessage } from "@/components/States";
import { TextField } from "@/components/TextField";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, fonts, radius, type } from "@/theme";

const SAMPLE_CUSTOMER = "customer@freshbasket.local";

/** Only allow in-app relative paths as a post-login destination. */
function safeNext(next: string | undefined): Href {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next as Href;
  return "/profile";
}

export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  /** "code" = passwordless email code (default, like the website); "password" = email + password. */
  const [method, setMethod] = useState<"code" | "password">("code");
  /** Step after an email was sent: enter the code ("email" sign-in or "signup" confirmation). */
  const [codeFor, setCodeFor] = useState<"email" | "signup" | null>(null);
  const [code, setCode] = useState("");
  const [wait, setWait] = useState(0);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const done = () => {
    const dest = safeNext(next);
    if (router.canGoBack()) router.back();
    // Replace after closing the modal so "back" from the destination doesn't return to login.
    setTimeout(() => router.replace(dest), 0);
  };

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const devSignIn = (addr: string) =>
    run(async () => {
      if (!/^\S+@\S+\.\S+$/.test(addr.trim())) throw new Error("Enter a valid email address");
      await auth.devLogin(addr);
      done();
    });

  const supabaseSubmit = () =>
    run(async () => {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error("Enter a valid email address");
      if (password.length < (tab === "signup" ? 8 : 6)) throw new Error(tab === "signup" ? "Choose a password of at least 8 characters" : "Password must be at least 6 characters");
      if (tab === "signin") {
        await auth.signInWithPassword(email, password);
        done();
      } else {
        const res = await auth.signUpWithPassword(email, password, name.trim() || undefined);
        if (res.needsConfirmation) {
          // Confirm right here with the code from the email (no need to open a link on this phone).
          setCodeFor("signup");
          setCode("");
          setWait(60);
          setNotice(`We emailed a code to ${email.trim()}. Enter it below to finish creating your account.`);
        } else done();
      }
    });

  const validEmail = () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) throw new Error("Enter a valid email address");
  };
  const sendCode = () =>
    run(async () => {
      validEmail();
      await auth.sendEmailCode(email, name.trim() || undefined);
      setCodeFor("email");
      setCode("");
      setWait(60);
      setNotice(`We emailed a sign-in code to ${email.trim()}. It may take a minute; check spam too.`);
    });
  const verifyCode = () =>
    run(async () => {
      if (!/^\d{6,8}$/.test(code.trim())) throw new Error("Enter the code from the email (6–8 digits)");
      await auth.verifyEmailCode(email, code, codeFor ?? "email", codeFor === "signup" ? password : undefined);
      done();
    });
  const resend = () =>
    run(async () => {
      if (codeFor === "signup") await auth.resendSignupCode(email);
      else await auth.sendEmailCode(email);
      setWait(60);
      setNotice("A new code is on its way. Use the newest email.");
    });
  const google = () =>
    run(async () => {
      if (await auth.signInWithGoogle()) done();
    });

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, paddingHorizontal: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.top}>
          <Logo />
          <IconButton label="Close" variant="soft" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
            <X size={20} color={colors.forest900} />
          </IconButton>
        </View>

        <Text style={[type.display, { marginTop: 28 }]} accessibilityRole="header">
          {codeFor ? "Check your email" : tab === "signup" && method === "password" && auth.mode === "supabase" ? "Create your account" : "Welcome back"}
        </Text>
        <Text style={[type.body, { marginTop: 6, marginBottom: 22 }]}>
          Sign in to place orders, save addresses and track deliveries.
        </Text>

        {!auth.ready ? (
          <Text style={type.body}>Loading…</Text>
        ) : auth.configError ? (
          <ErrorState message={auth.configError} onRetry={auth.retryConfig} />
        ) : auth.mode === "dev" ? (
          <View>
            <View style={styles.devBanner} accessibilityRole="text">
              <Text style={styles.devTitle}>Development login</Text>
              <Text style={styles.devText}>
                No password needed. This only works while the server runs in development mode; it is disabled in production.
              </Text>
            </View>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="go"
              onSubmitEditing={() => devSignIn(email)}
            />
            <Button label="Continue" variant="dark" size="lg" fullWidth loading={busy} onPress={() => devSignIn(email)} />
            <Text style={[styles.or]}>or use a sample account</Text>
            <Button
              label="Sample customer"
              variant="lime"
              fullWidth
              disabled={busy}
              onPress={() => devSignIn(SAMPLE_CUSTOMER)}
              accessibilityHint={`Signs in as ${SAMPLE_CUSTOMER}`}
            />
            <Text style={[type.small, { textAlign: "center", marginTop: 6 }]}>{SAMPLE_CUSTOMER}</Text>
          </View>
        ) : auth.mode === "supabase" ? (
          codeFor ? (
            <View>
              <TextField
                label="Code from the email"
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 8))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={8}
                returnKeyType="go"
                onSubmitEditing={verifyCode}
              />
              <Button label={codeFor === "signup" ? "Confirm & sign in" : "Verify & sign in"} variant="dark" size="lg" fullWidth loading={busy} onPress={verifyCode} />
              <View style={styles.codeRow}>
                <Button label={wait > 0 ? `Resend code in ${wait}s` : "Resend code"} variant="ghost" size="sm" disabled={busy || wait > 0} onPress={resend} />
                <Button label="Change email" variant="ghost" size="sm" disabled={busy} onPress={() => { setCodeFor(null); setNotice(null); setError(null); }} />
              </View>
            </View>
          ) : (
            <View>
              {auth.googleEnabled ? (
                <>
                  <Button label="Continue with Google" variant="outline" size="lg" fullWidth disabled={busy} onPress={google} />
                  <Text style={styles.or}>or use your email</Text>
                </>
              ) : null}
              <View style={styles.tabs} accessibilityRole="tablist">
                <View style={{ flex: 1 }}>
                  <Chip label="Email code" selected={method === "code"} onPress={() => setMethod("code")} />
                </View>
                <View style={{ flex: 1 }}>
                  <Chip label="Password" selected={method === "password"} onPress={() => setMethod("password")} />
                </View>
              </View>
              {method === "code" ? (
                <>
                  <TextField
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
                    returnKeyType="go"
                    onSubmitEditing={sendCode}
                    hint="No password needed: we email you a code. New here? Your account is created with it."
                  />
                  <Button label="Email me a code" variant="dark" size="lg" fullWidth loading={busy} onPress={sendCode} />
                </>
              ) : (
                <>
                  <View style={[styles.tabs, { marginBottom: 12 }]}>
                    <View style={{ flex: 1 }}>
                      <Chip label="Sign in" selected={tab === "signin"} onPress={() => setTab("signin")} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Chip label="Create account" selected={tab === "signup"} onPress={() => setTab("signup")} />
                    </View>
                  </View>
                  {tab === "signup" ? (
                    <TextField label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
                  ) : null}
                  <TextField
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textContentType="emailAddress"
                  />
                  <TextField
                    label="Password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry
                    autoComplete={tab === "signin" ? "current-password" : "new-password"}
                    textContentType={tab === "signin" ? "password" : "newPassword"}
                    hint={tab === "signup" ? "At least 8 characters" : undefined}
                    onSubmitEditing={supabaseSubmit}
                    returnKeyType="go"
                  />
                  <Button
                    label={tab === "signin" ? "Sign in" : "Create account"}
                    variant="dark"
                    size="lg"
                    fullWidth
                    loading={busy}
                    onPress={supabaseSubmit}
                  />
                </>
              )}
            </View>
          )
        ) : (
          <InlineMessage tone="warning">Sign-in isn't configured on the server yet. Please try again later.</InlineMessage>
        )}

        {error ? (
          <View style={{ marginTop: 14 }}>
            <InlineMessage tone="danger">{error}</InlineMessage>
          </View>
        ) : null}
        {notice ? (
          <View style={{ marginTop: 14 }}>
            <InlineMessage tone="success">{notice}</InlineMessage>
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ivory },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  devBanner: {
    backgroundColor: colors.amberBg,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#f0dfb0",
  },
  devTitle: { fontFamily: fonts.bold, fontSize: 13, color: colors.amber, textTransform: "uppercase", letterSpacing: 0.8 },
  devText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.inkSoft, marginTop: 4 },
  or: { textAlign: "center", fontFamily: fonts.medium, fontSize: 13, color: colors.muted, marginVertical: 16 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 18 },
  codeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
});

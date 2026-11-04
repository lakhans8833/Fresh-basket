import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";

/**
 * Google sign-in returns to freshbasket://auth-callback?code=…. Normally the browser session hands that
 * URL back to signInWithGoogle (lib/auth.tsx), which exchanges the code. FB-37(a): if the system opens
 * this route instead (or as well), the code is exchanged here — once; a code the sign-in is already
 * exchanging is not exchanged twice — then the app goes home.
 */
export default function AuthCallback() {
  const { code, error_description: errDesc, error } = useLocalSearchParams<{ code?: string; error_description?: string; error?: string }>();
  const auth = useAuth();
  const router = useRouter();
  const [failed, setFailed] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!code || started.current || !auth.ready) return;
    started.current = true;
    auth
      .completeOAuthRedirect(code)
      .then(() => router.replace("/"))
      .catch((e: unknown) => setFailed(e instanceof Error ? e.message : "Sign-in didn't finish. Please try again."));
  }, [code, auth, router]);

  if (!code) return <Redirect href={error || errDesc ? "/login" : "/"} />;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      {failed ? (
        <>
          <Text style={{ fontSize: 16, textAlign: "center", marginBottom: 16 }}>{failed}</Text>
          <Text accessibilityRole="link" onPress={() => router.replace("/login")} style={{ fontSize: 16, fontWeight: "600", color: "#2f7d32" }}>
            Back to sign in
          </Text>
        </>
      ) : (
        <ActivityIndicator size="large" />
      )}
    </View>
  );
}

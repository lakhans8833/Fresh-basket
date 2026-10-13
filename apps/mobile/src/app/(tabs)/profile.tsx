import Constants from "expo-constants";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ChevronRight, CircleQuestionMark, FileText, LogOut, MapPin, Phone, ReceiptText, Truck } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { profileUpdateSchema } from "@shared/schemas";
import type { Profile } from "@shared/types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Logo } from "@/components/Logo";
import { ListSkeleton } from "@/components/Skeleton";
import { InlineMessage } from "@/components/States";
import { TextField } from "@/components/TextField";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { API_URL } from "@/lib/config";
import { useSettings } from "@/lib/settings";
import { colors, fonts, radius, type } from "@/theme";

export default function ProfileTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const auth = useAuth();
  const { settings } = useSettings();
  const version = Constants.expoConfig?.version ?? "1.0.0";
  const openSite = (path: string) => WebBrowser.openBrowserAsync(`${API_URL}${path}`).catch(() => undefined);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 32, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <Text style={type.h1} accessibilityRole="header">
            Profile
          </Text>
          {auth.mode === "dev" ? (
            <View style={styles.devBadge} accessibilityLabel="Development mode">
              <Text style={styles.devBadgeText}>DEV</Text>
            </View>
          ) : null}
        </View>

        {!auth.ready ? (
          <ListSkeleton rows={2} />
        ) : auth.signedIn && auth.profile ? (
          <ProfileCard profile={auth.profile} />
        ) : (
          <View style={styles.signedOut}>
            <Logo size="lg" inverse />
            <Text style={[type.h2, { color: colors.ivory, marginTop: 18 }]}>Sign in for faster checkout</Text>
            <Text style={[type.body, { color: colors.lime100, marginTop: 6 }]}>Save addresses, track orders and reorder in one tap.</Text>
            <Button label="Sign in" variant="lime" onPress={() => router.push({ pathname: "/login", params: { next: "/profile" } })} style={{ marginTop: 16, alignSelf: "flex-start" }} />
          </View>
        )}

        {auth.signedIn ? (
          <Card style={{ paddingVertical: 4 }}>
            <LinkRow icon={<MapPin size={19} color={colors.leaf600} />} label="Saved addresses" onPress={() => router.push("/addresses")} />
            <LinkRow icon={<ReceiptText size={19} color={colors.leaf600} />} label="Your orders" onPress={() => router.push("/orders")} last />
          </Card>
        ) : null}

        <Card style={{ paddingVertical: 4 }}>
          <LinkRow icon={<CircleQuestionMark size={19} color={colors.leaf600} />} label="Help & FAQs" onPress={() => openSite("/help")} />
          <LinkRow icon={<Phone size={19} color={colors.leaf600} />} label="Contact us" onPress={() => openSite("/contact")} />
          <LinkRow icon={<Truck size={19} color={colors.leaf600} />} label="Delivery policy" onPress={() => openSite("/delivery-policy")} />
          <LinkRow icon={<FileText size={19} color={colors.leaf600} />} label="Returns & refunds" onPress={() => openSite("/returns")} />
          <LinkRow icon={<FileText size={19} color={colors.leaf600} />} label="Privacy policy" onPress={() => openSite("/privacy")} />
          <LinkRow icon={<FileText size={19} color={colors.leaf600} />} label="Terms of service" onPress={() => openSite("/terms")} last />
        </Card>

        {settings?.supportPhone || settings?.supportEmail ? (
          <Text style={[type.small, { textAlign: "center" }]}>
            Need help? {[settings.supportPhone, settings.supportEmail].filter(Boolean).join(" · ")}
          </Text>
        ) : null}

        {auth.signedIn ? (
          <Button
            label="Sign out"
            variant="danger"
            fullWidth
            icon={<LogOut size={17} color={colors.danger} />}
            onPress={() => void auth.signOut()}
          />
        ) : null}

        <Text style={[type.small, { textAlign: "center" }]}>
          {settings?.storeName ?? "Fresh Basket"} app v{version}
          {auth.mode === "dev" ? " · development server" : ""}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ProfileCard({ profile }: { profile: Profile }) {
  const auth = useAuth();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.fullName ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string }>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  useEffect(() => {
    if (!editing) {
      setName(profile.fullName ?? "");
      setPhone(profile.phone ?? "");
    }
  }, [profile, editing]);

  const save = async () => {
    setMsg(null);
    const parsed = profileUpdateSchema.safeParse({ fullName: name, phone: phone.trim() ? phone : null });
    if (!parsed.success) {
      const errs: typeof errors = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0] as "fullName" | "phone";
        errs[k] ??= k === "fullName" ? "Enter your name (2+ characters)" : i.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const res = await api<{ profile: Profile }>("/api/me", { method: "PUT", body: parsed.data });
      auth.setProfile(res.profile);
      setEditing(false);
      setMsg({ tone: "success", text: "Profile updated." });
    } catch (e) {
      setMsg({ tone: "danger", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const initials = (profile.fullName || profile.email || "?")
    .split(/[\s@]+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  return (
    <Card>
      <View style={styles.profileTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={type.h3}>{profile.fullName || "Add your name"}</Text>
          <Text style={type.small}>{profile.email}</Text>
          {profile.phone ? <Text style={type.small}>{profile.phone}</Text> : null}
        </View>
        {!editing ? <Button label="Edit" variant="outline" size="sm" onPress={() => setEditing(true)} accessibilityLabel="Edit profile" /> : null}
      </View>
      {editing ? (
        <View style={{ marginTop: 16 }}>
          <TextField label="Full name" value={name} onChangeText={setName} error={errors.fullName} autoComplete="name" />
          <TextField label="Mobile number" value={phone} onChangeText={setPhone} error={errors.phone} keyboardType="phone-pad" autoComplete="tel" />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label="Cancel" variant="outline" onPress={() => setEditing(false)} style={{ flex: 1 }} />
            <Button label="Save" variant="dark" onPress={save} loading={busy} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}
      {msg ? (
        <View style={{ marginTop: 12 }}>
          <InlineMessage tone={msg.tone}>{msg.text}</InlineMessage>
        </View>
      ) : null}
    </Card>
  );
}

function LinkRow({ icon, label, onPress, last }: { icon: ReactNode; label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.link, !last && styles.linkBorder, pressed && { opacity: 0.6 }]}
    >
      {icon}
      <Text style={styles.linkText}>{label}</Text>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ivory },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  devBadge: { backgroundColor: colors.amberBg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: "#f0dfb0" },
  devBadgeText: { fontFamily: fonts.bold, fontSize: 11, color: colors.amber, letterSpacing: 1 },
  signedOut: { backgroundColor: colors.forest900, borderRadius: radius.xl, padding: 20 },
  profileTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.lime200, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.serif, fontSize: 19, color: colors.forest900 },
  link: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52 },
  linkBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  linkText: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
});

import { useRouter } from "expo-router";
import { MapPin, Plus } from "lucide-react-native";
import { useState } from "react";
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Address } from "@shared/types";
import { AddressForm, addressToValues, emptyAddress, validateAddress, type AddressErrors, type AddressFormValues } from "@/components/AddressForm";
import { AddressSummary } from "@/components/AddressSummary";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/Chip";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SignInPrompt } from "@/components/SignInPrompt";
import { ListSkeleton } from "@/components/Skeleton";
import { EmptyState, ErrorState, InlineMessage } from "@/components/States";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useFetch } from "@/lib/useFetch";
import { colors, radius } from "@/theme";

export default function Addresses() {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const router = useRouter();
  const list = useFetch<{ addresses: Address[] }>(auth.signedIn ? "/api/me/addresses" : null, [auth.profile?.id]);
  const [editing, setEditing] = useState<{ id: string | null; values: AddressFormValues } | null>(null);
  const [errors, setErrors] = useState<AddressErrors>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (auth.ready && !auth.signedIn) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Saved addresses" />
        <SignInPrompt title="Sign in to manage addresses" message="Save addresses for faster checkout." next="/addresses" />
      </View>
    );
  }

  const openNew = () => {
    setErrors({});
    setEditing({ id: null, values: emptyAddress({ fullName: auth.profile?.fullName ?? "", phone: auth.profile?.phone ?? "", isDefault: (list.data?.addresses.length ?? 0) === 0 }) });
  };

  const save = async () => {
    if (!editing) return;
    const v = validateAddress(editing.values);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setBusy("save");
    setError(null);
    try {
      if (editing.id) await api(`/api/me/addresses/${editing.id}`, { method: "PUT", body: v.value });
      else await api("/api/me/addresses", { method: "POST", body: v.value });
      setEditing(null);
      await list.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const setDefault = async (a: Address) => {
    setBusy(a.id);
    setError(null);
    try {
      const { id: _id, ...rest } = a;
      await api(`/api/me/addresses/${a.id}`, { method: "PUT", body: { ...rest, isDefault: true } });
      await list.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (a: Address) => {
    const run = async () => {
      setBusy(a.id);
      setError(null);
      try {
        await api(`/api/me/addresses/${a.id}`, { method: "DELETE" });
        await list.refresh();
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(null);
      }
    };
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`Delete the address for ${a.fullName}?`)) void run();
      return;
    }
    Alert.alert("Delete address", `Delete the address for ${a.fullName}?`, [
      { text: "Keep", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void run() },
    ]);
  };

  return (
    <View style={styles.flex}>
      <ScreenHeader
        title="Saved addresses"
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/profile"))}
        right={<Button label="Add" size="sm" variant="lime" onPress={openNew} icon={<Plus size={16} color={colors.forest900} />} accessibilityLabel="Add address" />}
      />
      {error ? (
        <View style={{ paddingHorizontal: 16 }}>
          <InlineMessage tone="danger">{error}</InlineMessage>
        </View>
      ) : null}
      <FlatList
        data={list.data?.addresses ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={colors.leaf600} colors={[colors.leaf600]} />}
        ListEmptyComponent={
          list.error ? (
            <ErrorState message={list.error} onRetry={list.reload} />
          ) : list.loading || !auth.ready ? (
            <ListSkeleton rows={2} />
          ) : (
            <EmptyState icon={<MapPin size={28} color={colors.leaf600} />} title="No saved addresses" message="Add an address for faster checkout." actionLabel="Add address" onAction={openNew} />
          )
        }
        renderItem={({ item: a }) => (
          <View style={styles.card}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <AddressSummary address={a} />
              </View>
              {a.isDefault ? <StatusPill label="Default" tone="success" /> : null}
            </View>
            <View style={styles.actions}>
              <Button label="Edit" size="sm" variant="outline" onPress={() => { setErrors({}); setEditing({ id: a.id, values: addressToValues(a) }); }} accessibilityLabel={`Edit address for ${a.fullName}`} />
              {!a.isDefault ? (
                <Button label="Set default" size="sm" variant="ghost" loading={busy === a.id} onPress={() => setDefault(a)} accessibilityLabel={`Set ${a.label} address as default`} />
              ) : null}
              <View style={{ flex: 1 }} />
              <Button label="Delete" size="sm" variant="danger" onPress={() => remove(a)} accessibilityLabel={`Delete address for ${a.fullName}`} />
            </View>
          </View>
        )}
      />

      <Modal visible={!!editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScreenHeader title={editing?.id ? "Edit address" : "New address"} onBack={() => setEditing(null)} />
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
            {editing ? <AddressForm values={editing.values} onChange={(values) => setEditing({ ...editing, values })} errors={errors} /> : null}
            {error ? (
              <View style={{ marginBottom: 12 }}>
                <InlineMessage tone="danger">{error}</InlineMessage>
              </View>
            ) : null}
            <Button label="Save address" variant="dark" size="lg" fullWidth loading={busy === "save"} onPress={save} style={{ marginTop: 8 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ivory },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 14 },
  actions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
});

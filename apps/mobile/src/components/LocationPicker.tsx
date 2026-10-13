import { ChevronDown, MapPin, X } from "lucide-react-native";
import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isValidPincode, normalizePincode } from "@shared/pincode";
import type { DeliveryArea } from "@shared/types";
import { api, errorMessage } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { colors, fonts, HIT, radius, type } from "@/theme";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import { InlineMessage } from "./States";
import { TextField } from "./TextField";

export interface DeliveryCheck {
  pincode: string;
  serviceable: boolean;
  area: DeliveryArea | null;
}

export async function checkPincode(pin: string): Promise<DeliveryCheck> {
  return api<DeliveryCheck>(`/api/delivery/check?pincode=${encodeURIComponent(normalizePincode(pin))}`, { auth: false });
}

/** "Deliver to <area>, <city> ▾" row; opens a PIN code sheet. */
export function LocationRow({ compact }: { compact?: boolean }) {
  const { location } = useCart();
  const [open, setOpen] = useState(false);
  const text = location ? `${location.areaName}, ${location.city}` : "Set your PIN code";
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={location ? `Deliver to ${text}. Change PIN code` : "Set delivery PIN code"}
        style={({ pressed }) => [styles.row, compact && { paddingVertical: 0 }, pressed && { opacity: 0.7 }]}
      >
        <MapPin size={17} color={colors.leaf600} />
        <Text style={styles.deliver} numberOfLines={1}>
          Deliver to <Text style={styles.area}>{text}</Text>
        </Text>
        <ChevronDown size={17} color={colors.forest900} />
      </Pressable>
      <LocationSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function LocationSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { location, setLocation } = useCart();
  const [pin, setPin] = useState(location?.pincode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notServed, setNotServed] = useState(false);

  const submit = async () => {
    setError(null);
    setNotServed(false);
    if (!isValidPincode(pin)) {
      setError("Enter a valid 6-digit PIN code");
      return;
    }
    setBusy(true);
    try {
      const res = await checkPincode(pin);
      if (res.serviceable && res.area) {
        setLocation({ pincode: res.pincode, areaName: res.area.areaName, city: res.area.city });
        onClose();
      } else {
        setNotServed(true);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]} accessibilityViewIsModal>
          <View style={styles.sheetHead}>
            <Text style={type.h2} accessibilityRole="header">
              Where should we deliver?
            </Text>
            <IconButton label="Close" onPress={onClose}>
              <X size={20} color={colors.forest900} />
            </IconButton>
          </View>
          <Text style={[type.body, { marginBottom: 14 }]}>Enter your PIN code to check delivery and charges.</Text>
          <TextField
            label="PIN code"
            value={pin}
            onChangeText={(t) => setPin(t.replace(/[^0-9]/g, "").slice(0, 6))}
            keyboardType="number-pad"
            maxLength={6}
            placeholder="e.g. 560034"
            error={error}
            onSubmitEditing={submit}
            returnKeyType="done"
            autoFocus
          />
          {notServed ? (
            <View style={{ marginBottom: 14 }}>
              <InlineMessage tone="warning">Sorry, we don't deliver to {pin} yet. Try a nearby PIN code.</InlineMessage>
            </View>
          ) : null}
          <Button label="Check & save" variant="dark" onPress={submit} loading={busy} fullWidth />
          {location ? (
            <Button
              label="Clear location"
              variant="ghost"
              size="sm"
              onPress={() => {
                setLocation(null);
                setPin("");
                onClose();
              }}
              style={{ marginTop: 8 }}
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: HIT, paddingVertical: 4 },
  deliver: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, flexShrink: 1 },
  area: { fontFamily: fonts.semibold, color: colors.forest900 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(20,48,31,0.35)" },
  sheet: {
    backgroundColor: colors.ivory,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
});

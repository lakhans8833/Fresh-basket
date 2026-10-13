import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { addressInputSchema, type AddressInput } from "@shared/schemas";
import { isValidPincode } from "@shared/pincode";
import type { Address } from "@shared/types";
import { colors, fonts, HIT } from "@/theme";
import { Chip } from "./Chip";
import { checkPincode } from "./LocationPicker";
import { TextField } from "./TextField";

export interface AddressFormValues {
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export type AddressErrors = Partial<Record<keyof AddressFormValues, string>>;

export function emptyAddress(defaults?: Partial<AddressFormValues>): AddressFormValues {
  return { label: "Home", fullName: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "", pincode: "", isDefault: false, ...defaults };
}

export function addressToValues(a: Address): AddressFormValues {
  return {
    label: a.label,
    fullName: a.fullName,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 ?? "",
    landmark: a.landmark ?? "",
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    isDefault: a.isDefault,
  };
}

/** Validate with the shared addressInputSchema. Returns parsed input or field errors. */
export function validateAddress(v: AddressFormValues): { ok: true; value: AddressInput } | { ok: false; errors: AddressErrors } {
  const res = addressInputSchema.safeParse({
    ...v,
    line2: v.line2.trim() || null,
    landmark: v.landmark.trim() || null,
  });
  if (res.success) return { ok: true, value: res.data };
  const errors: AddressErrors = {};
  for (const issue of res.error.issues) {
    const key = issue.path[0] as keyof AddressFormValues | undefined;
    if (key && !errors[key]) errors[key] = issue.message.startsWith("Too") || issue.message.startsWith("Invalid") ? "Please check this field" : issue.message;
  }
  return { ok: false, errors };
}

const LABELS = ["Home", "Work", "Other"];

export function AddressForm({
  values,
  onChange,
  errors,
  showDefaultToggle = true,
}: {
  values: AddressFormValues;
  onChange: (v: AddressFormValues) => void;
  errors: AddressErrors;
  showDefaultToggle?: boolean;
}) {
  const set = <K extends keyof AddressFormValues>(k: K, val: AddressFormValues[K]) => onChange({ ...values, [k]: val });
  const [pinHint, setPinHint] = useState<{ text: string; tone: "muted" | "success" | "danger" } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isValidPincode(values.pincode)) {
      setPinHint(null);
      return;
    }
    setPinHint({ text: "Checking delivery…", tone: "muted" });
    checkPincode(values.pincode)
      .then((r) => {
        if (cancelled) return;
        if (r.serviceable && r.area) {
          setPinHint({ text: `We deliver to ${r.area.areaName}, ${r.area.city}`, tone: "success" });
          if (!values.city.trim()) onChange({ ...values, city: r.area.city });
        } else setPinHint({ text: "Sorry, we don't deliver to this PIN code yet.", tone: "danger" });
      })
      .catch(() => !cancelled && setPinHint(null));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.pincode]);

  return (
    <View>
      <Text style={styles.label}>Save as</Text>
      <View style={styles.labels}>
        {LABELS.map((l) => (
          <Chip key={l} label={l} selected={values.label === l} onPress={() => set("label", l)} />
        ))}
      </View>
      <TextField label="Full name" value={values.fullName} onChangeText={(t) => set("fullName", t)} error={errors.fullName} autoComplete="name" textContentType="name" />
      <TextField
        label="Mobile number"
        value={values.phone}
        onChangeText={(t) => set("phone", t)}
        error={errors.phone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        placeholder="10-digit mobile"
      />
      <TextField label="House / flat, street" value={values.line1} onChangeText={(t) => set("line1", t)} error={errors.line1} autoComplete="street-address" />
      <TextField label="Area / locality (optional)" value={values.line2} onChangeText={(t) => set("line2", t)} error={errors.line2} />
      <TextField label="Landmark (optional)" value={values.landmark} onChangeText={(t) => set("landmark", t)} error={errors.landmark} />
      <TextField
        label="PIN code"
        value={values.pincode}
        onChangeText={(t) => set("pincode", t.replace(/[^0-9]/g, "").slice(0, 6))}
        error={errors.pincode}
        hint={pinHint?.text}
        hintTone={pinHint?.tone}
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="postal-code"
      />
      <View style={styles.row2}>
        <View style={{ flex: 1 }}>
          <TextField label="City" value={values.city} onChangeText={(t) => set("city", t)} error={errors.city} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="State" value={values.state} onChangeText={(t) => set("state", t)} error={errors.state} />
        </View>
      </View>
      {showDefaultToggle ? (
        <Pressable
          onPress={() => set("isDefault", !values.isDefault)}
          accessibilityRole="switch"
          accessibilityState={{ checked: values.isDefault }}
          accessibilityLabel="Use as default address"
          style={styles.toggle}
        >
          <Text style={styles.toggleText}>Use as default address</Text>
          <Switch
            value={values.isDefault}
            onValueChange={(v) => set("isDefault", v)}
            trackColor={{ true: colors.leaf600, false: colors.line }}
            thumbColor={colors.white}
            aria-hidden
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft, marginBottom: 6 },
  labels: { flexDirection: "row", gap: 8, marginBottom: 14 },
  row2: { flexDirection: "row", gap: 10 },
  toggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: HIT },
  toggleText: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
});

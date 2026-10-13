import { StyleSheet, Text, View } from "react-native";
import type { Address } from "@shared/types";
import { colors, fonts } from "@/theme";

type AddressLike = Pick<Address, "fullName" | "phone" | "line1" | "line2" | "landmark" | "city" | "state" | "pincode"> & { label?: string };

export function addressOneLine(a: AddressLike): string {
  return [a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join(", ");
}

export function AddressSummary({ address, showLabel = true }: { address: AddressLike; showLabel?: boolean }) {
  return (
    <View>
      <Text style={styles.name}>
        {showLabel && address.label ? <Text style={styles.label}>{address.label.toUpperCase()}  </Text> : null}
        {address.fullName}
      </Text>
      <Text style={styles.text}>{addressOneLine(address)}</Text>
      <Text style={styles.text}>{address.phone}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  label: { fontFamily: fonts.bold, fontSize: 11, color: colors.leaf600, letterSpacing: 0.8 },
  text: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.inkSoft, marginTop: 2 },
});

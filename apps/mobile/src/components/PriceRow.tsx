import { StyleSheet, Text, View } from "react-native";
import { formatINR } from "@shared/money";
import { colors, fonts } from "@/theme";

export function PriceRow({
  label,
  value,
  emphasis,
  tone,
  valueText,
}: {
  label: string;
  value?: number;
  emphasis?: boolean;
  tone?: "discount" | "free";
  /** overrides the formatted value */
  valueText?: string;
}) {
  const text = valueText ?? (value === undefined ? "—" : tone === "discount" ? `− ${formatINR(value)}` : formatINR(value));
  return (
    <View style={[styles.row, emphasis && styles.emph]} accessible accessibilityLabel={`${label}: ${text}`}>
      <Text style={[styles.label, emphasis && styles.labelEmph]}>{label}</Text>
      <Text
        style={[
          styles.value,
          emphasis && styles.valueEmph,
          (tone === "discount" || tone === "free") && { color: colors.leaf600 },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  emph: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 6, paddingTop: 12 },
  label: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkSoft },
  labelEmph: { fontFamily: fonts.semibold, fontSize: 16, color: colors.ink },
  value: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  valueEmph: { fontFamily: fonts.bold, fontSize: 18, color: colors.forest900 },
});

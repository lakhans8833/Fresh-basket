import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fonts, HIT, radius } from "@/theme";

export function Chip({
  label,
  selected,
  onPress,
  disabled,
  sublabel,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  sublabel?: string;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      accessibilityLabel={sublabel ? `${label}, ${sublabel}` : label}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && { opacity: 0.75 },
      ]}
    >
      <Text style={[styles.label, selected && { color: colors.ivory }, disabled && { color: colors.muted }]}>{label}</Text>
      {sublabel ? <Text style={[styles.sub, selected && { color: colors.lime200 }]}>{sublabel}</Text> : null}
    </Pressable>
  );
}

export function StatusPill({ label, tone }: { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" }) {
  const map = {
    neutral: [colors.sage100, colors.inkSoft],
    success: [colors.lime100, colors.leaf600],
    warning: [colors.amberBg, colors.amber],
    danger: [colors.dangerBg, colors.danger],
    info: ["#e8f0fb", "#1f5aa8"],
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: map[0] }]}>
      <Text style={[styles.pillText, { color: map[1] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: HIT,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  selected: { backgroundColor: colors.forest800, borderColor: colors.forest800 },
  disabled: { backgroundColor: colors.sage50, borderStyle: "dashed" },
  label: { fontFamily: fonts.semibold, fontSize: 14, color: colors.forest900 },
  sub: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, marginTop: 1 },
  pill: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontFamily: fonts.semibold, fontSize: 12 },
});

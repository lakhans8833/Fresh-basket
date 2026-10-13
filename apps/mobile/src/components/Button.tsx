import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, fonts, HIT, radius } from "@/theme";

type Variant = "primary" | "dark" | "lime" | "outline" | "ghost" | "danger";

const palette: Record<Variant, { bg: string; fg: string; border?: string; pressed: string }> = {
  primary: { bg: colors.leaf600, fg: colors.white, pressed: "#336d2b" },
  dark: { bg: colors.forest800, fg: colors.ivory, pressed: colors.forest900 },
  lime: { bg: colors.lime200, fg: colors.forest900, pressed: colors.lime300 },
  outline: { bg: colors.white, fg: colors.forest900, border: colors.line, pressed: colors.sage50 },
  ghost: { bg: "transparent", fg: colors.forest800, pressed: colors.sage100 },
  danger: { bg: colors.white, fg: colors.danger, border: "#f1c8c2", pressed: colors.dangerBg },
};

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  icon,
  iconRight,
  fullWidth,
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const p = palette[variant];
  const inactive = disabled || loading;
  const height = size === "lg" ? 56 : size === "sm" ? HIT : 50;
  return (
    <Pressable
      testID={testID}
      onPress={inactive ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      hitSlop={size === "sm" ? 4 : 0}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: height,
          paddingHorizontal: size === "sm" ? 14 : 20,
          backgroundColor: pressed && !inactive ? p.pressed : p.bg,
          borderColor: p.border ?? "transparent",
          borderWidth: p.border ? 1 : 0,
          opacity: disabled && !loading ? 0.45 : 1,
          alignSelf: fullWidth ? "stretch" : "auto",
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <View style={styles.row}>
          {icon}
          <Text
            numberOfLines={1}
            style={[styles.label, { color: p.fg, fontSize: size === "sm" ? 14 : size === "lg" ? 16 : 15 }]}
          >
            {label}
          </Text>
          {iconRight}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { fontFamily: fonts.semibold },
});

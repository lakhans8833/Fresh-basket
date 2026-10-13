import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, fonts, HIT } from "@/theme";

export function IconButton({
  children,
  onPress,
  label,
  badge,
  variant = "plain",
  style,
  selected,
}: {
  children: ReactNode;
  onPress?: () => void;
  label: string;
  badge?: number;
  variant?: "plain" | "soft" | "solid";
  style?: StyleProp<ViewStyle>;
  selected?: boolean;
}) {
  const bg = variant === "soft" ? colors.white : variant === "solid" ? colors.forest800 : "transparent";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} item${badge === 1 ? "" : "s"}` : label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      hitSlop={6}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: pressed ? 0.7 : 1 },
        variant === "soft" && styles.soft,
        style,
      ]}
    >
      {children}
      {badge ? (
        <View style={styles.badge} aria-hidden>
          <Text style={styles.badgeText}>{badge > 99 ? "99+" : badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: HIT, height: HIT, borderRadius: HIT / 2, alignItems: "center", justifyContent: "center" },
  soft: { borderWidth: 1, borderColor: colors.line },
  badge: {
    position: "absolute",
    top: 2,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.tomato,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.ivory,
  },
  badgeText: { color: colors.white, fontFamily: fonts.bold, fontSize: 10, lineHeight: 12 },
});

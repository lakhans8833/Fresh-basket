import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius } from "@/theme";

export function Skeleton({
  width = "100%",
  height = 14,
  r = 8,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  r?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      aria-hidden
      style={[{ width, height, borderRadius: r, backgroundColor: colors.sage100, opacity }, style]}
    />
  );
}

export function ProductCardSkeleton() {
  return (
    <View style={styles.card} accessibilityLabel="Loading" accessible>
      <Skeleton height={130} r={radius.md} />
      <Skeleton width="70%" height={14} style={{ marginTop: 12 }} />
      <Skeleton width="40%" height={12} style={{ marginTop: 8 }} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 14 }}>
        <Skeleton width={50} height={18} />
        <Skeleton width={64} height={34} r={17} />
      </View>
    </View>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={{ gap: 12 }} accessible accessibilityLabel="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={[styles.card, { flexDirection: "row", gap: 12, alignItems: "center" }]}>
          <Skeleton width={64} height={64} r={radius.md} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="60%" />
            <Skeleton width="35%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.white, borderRadius: radius.lg, padding: 10, borderWidth: 1, borderColor: colors.line },
});

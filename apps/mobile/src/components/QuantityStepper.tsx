import { Minus, Plus, Trash } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MAX_QTY_PER_LINE } from "@shared/pricing";
import { colors, fonts, HIT, radius } from "@/theme";

export function QuantityStepper({
  value,
  onChange,
  max = MAX_QTY_PER_LINE,
  min = 1,
  itemName,
  size = "md",
  allowRemove = false,
}: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
  min?: number;
  itemName: string;
  size?: "sm" | "md";
  /** when true, decrementing at 1 removes (shows a trash icon) */
  allowRemove?: boolean;
}) {
  const atMin = value <= min;
  const atMax = value >= max;
  const showTrash = allowRemove && value <= 1;
  const h = size === "sm" ? 38 : HIT;
  return (
    <View style={[styles.wrap, { height: h }]}>
      <Pressable
        onPress={() => (showTrash ? onChange(0) : !atMin && onChange(value - 1))}
        disabled={atMin && !showTrash}
        accessibilityRole="button"
        accessibilityLabel={showTrash ? `Remove ${itemName}` : `Decrease ${itemName} quantity`}
        accessibilityState={{ disabled: atMin && !showTrash }}
        hitSlop={{ top: (HIT - h) / 2 + 2, bottom: (HIT - h) / 2 + 2, left: 4, right: 0 }}
        style={({ pressed }) => [styles.btn, { width: h, height: h, opacity: atMin && !showTrash ? 0.35 : pressed ? 0.6 : 1 }]}
      >
        {showTrash ? <Trash size={16} color={colors.danger} /> : <Minus size={17} color={colors.forest900} />}
      </Pressable>
      <Text style={styles.value} accessibilityLabel={`${itemName} quantity ${value}`} accessibilityLiveRegion="polite">
        {value}
      </Text>
      <Pressable
        onPress={() => !atMax && onChange(value + 1)}
        disabled={atMax}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${itemName} quantity`}
        accessibilityState={{ disabled: atMax }}
        hitSlop={{ top: (HIT - h) / 2 + 2, bottom: (HIT - h) / 2 + 2, left: 0, right: 4 }}
        style={({ pressed }) => [styles.btn, { width: h, height: h, opacity: atMax ? 0.35 : pressed ? 0.6 : 1 }]}
      >
        <Plus size={17} color={colors.forest900} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.lime100,
    borderRadius: radius.pill,
  },
  btn: { alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  value: { minWidth: 26, textAlign: "center", fontFamily: fonts.bold, fontSize: 15, color: colors.forest900 },
});

import { useRouter } from "expo-router";
import { ChevronRight, ShoppingBasket } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatINR } from "@shared/money";
import { useCart } from "@/lib/cart";
import { colors, fonts } from "@/theme";

/**
 * While the basket has items: a green bar at the bottom of the screen with the count and value that
 * opens the basket in one tap (the quick-commerce pattern; the website shows the same bar on phones).
 * Place it last inside a screen whose root is a flex:1 View.
 */
export function CartBar() {
  const router = useRouter();
  const { lines, count, hydrated, quote } = useCart();
  if (!hydrated || count === 0) return null;
  // Today's price from the server quote when it has the line (prices change); the price seen when the
  // item was added only until the quote arrives.
  const unit = new Map((quote?.quote.lines ?? []).map((q) => [q.variantId, q.unitPrice]));
  const total = lines.reduce((s, l) => s + l.quantity * (unit.get(l.variantId) ?? l.priceHint ?? 0), 0);
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        onPress={() => router.push("/cart")}
        accessibilityRole="button"
        accessibilityLabel={`View basket, ${count} item${count === 1 ? "" : "s"}, ${formatINR(total)}`}
        style={({ pressed }) => [styles.bar, pressed && { backgroundColor: colors.forest900 }]}
      >
        <View style={styles.icon}>
          <ShoppingBasket size={20} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.count}>
            {count} item{count === 1 ? "" : "s"}
          </Text>
          <Text style={styles.total}>{formatINR(total)}</Text>
        </View>
        <Text style={styles.cta}>View basket</Text>
        <ChevronRight size={18} color={colors.white} />
      </Pressable>
    </View>
  );
}

/** Space to leave at the end of a scrolling screen so the bar never covers the last row. */
export const CART_BAR_SPACE = 76;

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingBottom: 10 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.leaf600,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 56,
  },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" },
  count: { fontFamily: fonts.semibold, fontSize: 13, color: colors.white },
  total: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
  cta: { fontFamily: fonts.bold, fontSize: 15, color: colors.white },
});

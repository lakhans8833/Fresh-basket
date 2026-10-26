import { StyleSheet, View } from "react-native";
import type { ProductSummary } from "@shared/types";
import { ProductCard } from "./ProductCard";
import { ProductCardSkeleton } from "./Skeleton";

/** Simple 2-column grid (used inside ScrollViews; lists are short). */
export function ProductGrid({ products, gap = 12 }: { products: ProductSummary[]; gap?: number }) {
  const rows: ProductSummary[][] = [];
  for (let i = 0; i < products.length; i += 2) rows.push(products.slice(i, i + 2));
  return (
    <View style={[styles.grid, { gap }]}>
      {rows.map((row, r) => (
        <View key={row[0]!.id} style={[styles.row, { gap }]}>
          {row.map((p, c) => (
            <ProductCard key={p.id} product={p} index={r * 2 + c} />
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

export function ProductGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <View style={styles.grid}>
      {Array.from({ length: Math.ceil(count / 2) }).map((_, i) => (
        <View key={i} style={styles.row}>
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 12 },
  row: { flexDirection: "row", gap: 12 },
});

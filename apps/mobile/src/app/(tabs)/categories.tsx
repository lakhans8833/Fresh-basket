import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Category, ProductSummary } from "@shared/types";
import { CartButton } from "@/components/CartButton";
import { Chip } from "@/components/Chip";
import { ProductGrid, ProductGridSkeleton } from "@/components/ProductGrid";
import { ProductImage } from "@/components/ProductImage";
import { SearchField } from "@/components/SearchField";
import { EmptyState, ErrorState } from "@/components/States";
import { useFetch } from "@/lib/useFetch";
import { colors, fonts, HIT, radius, type } from "@/theme";

type Sort = "featured" | "price_asc" | "price_desc" | "name";
const SORTS: { key: Sort; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "price_asc", label: "Price: low to high" },
  { key: "price_desc", label: "Price: high to low" },
  { key: "name", label: "Name A–Z" },
];

export default function Categories() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string; category?: string; seasonal?: string }>();
  const [q, setQ] = useState(params.q ?? "");
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [category, setCategory] = useState(params.category ?? "");
  const [seasonal, setSeasonal] = useState(params.seasonal === "1");
  const [inStock, setInStock] = useState(false);
  const [sort, setSort] = useState<Sort>("featured");

  // Navigation from Home passes params; apply them when they change.
  useEffect(() => {
    if (params.q !== undefined) {
      setQ(params.q);
      setDebouncedQ(params.q);
    }
    if (params.category !== undefined) setCategory(params.category);
    if (params.seasonal !== undefined) setSeasonal(params.seasonal === "1");
  }, [params.q, params.category, params.seasonal]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const categories = useFetch<{ categories: Category[] }>("/api/categories");
  const path = useMemo(() => {
    const sp = new URLSearchParams();
    if (debouncedQ) sp.set("q", debouncedQ);
    if (category) sp.set("category", category);
    if (seasonal) sp.set("seasonal", "1");
    if (inStock) sp.set("inStock", "1");
    sp.set("sort", sort);
    return `/api/products?${sp.toString()}`;
  }, [debouncedQ, category, seasonal, inStock, sort]);
  const products = useFetch<{ products: ProductSummary[] }>(path);

  const activeCat = categories.data?.categories.find((c) => c.slug === category);
  const hasFilters = !!(debouncedQ || category || seasonal || inStock);
  const clearAll = () => {
    setQ("");
    setDebouncedQ("");
    setCategory("");
    setSeasonal(false);
    setInStock(false);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ivory }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={products.refreshing}
          onRefresh={() => {
            void products.refresh();
            void categories.refresh();
          }}
          tintColor={colors.leaf600}
          colors={[colors.leaf600]}
        />
      }
    >
      <View style={styles.pad}>
        <View style={styles.titleRow}>
          <Text style={type.h1} accessibilityRole="header">
            {activeCat ? activeCat.name : seasonal ? "In season now" : "All vegetables"}
          </Text>
          <CartButton />
        </View>
        <SearchField value={q} onChangeText={setQ} onSubmit={() => setDebouncedQ(q.trim())} />
      </View>

      {/* Category tiles */}
      {categories.error ? (
        <ErrorState compact message={categories.error} onRetry={categories.reload} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          <CategoryTile name="All" imageUrl={null} selected={!category} onPress={() => setCategory("")} />
          {(categories.data?.categories ?? []).map((c) => (
            <CategoryTile
              key={c.id}
              name={c.name}
              count={c.productCount}
              imageUrl={c.imageUrl}
              selected={category === c.slug}
              onPress={() => setCategory(category === c.slug ? "" : c.slug)}
            />
          ))}
        </ScrollView>
      )}

      {/* Filters */}
      <View style={[styles.pad, { marginTop: 4 }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 6 }}>
          {SORTS.map((s) => (
            <Chip key={s.key} label={s.label} selected={sort === s.key} onPress={() => setSort(s.key)} />
          ))}
        </ScrollView>
        <View style={styles.toggles}>
          <ToggleRow label="In season" value={seasonal} onChange={setSeasonal} />
          <ToggleRow label="In stock only" value={inStock} onChange={setInStock} />
        </View>
      </View>

      <View style={[styles.pad, { marginTop: 8 }]}>
        {products.error ? (
          <ErrorState message={products.error} onRetry={products.reload} />
        ) : products.loading && !products.data ? (
          <ProductGridSkeleton count={6} />
        ) : products.data && products.data.products.length > 0 ? (
          <>
            <Text style={[type.small, { marginBottom: 10 }]} accessibilityLiveRegion="polite">
              {products.data.products.length} item{products.data.products.length === 1 ? "" : "s"}
              {debouncedQ ? ` for “${debouncedQ}”` : ""}
            </Text>
            <ProductGrid products={products.data.products} />
          </>
        ) : (
          <EmptyState
            title="No vegetables found"
            message={debouncedQ ? `We couldn't find anything matching “${debouncedQ}”.` : "Nothing matches these filters right now."}
            actionLabel={hasFilters ? "Clear filters" : undefined}
            onAction={hasFilters ? clearAll : undefined}
          />
        )}
      </View>
    </ScrollView>
  );
}

function CategoryTile({
  name,
  imageUrl,
  selected,
  onPress,
  count,
}: {
  name: string;
  imageUrl: string | null;
  selected: boolean;
  onPress: () => void;
  count?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={count !== undefined ? `${name}, ${count} items` : name}
      style={({ pressed }) => [styles.tile, selected && styles.tileSelected, pressed && { opacity: 0.75 }]}
    >
      <ProductImage uri={imageUrl} style={styles.tileImg} tint={selected ? colors.lime200 : colors.lime100} />
      <Text style={[styles.tileText, selected && { color: colors.ivory }]} numberOfLines={2}>
        {name}
      </Text>
    </Pressable>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      style={styles.toggle}
    >
      <Text style={styles.toggleText}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.leaf600, false: colors.line }}
        thumbColor={colors.white}
        aria-hidden
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  catRow: { paddingHorizontal: 16, gap: 10, paddingVertical: 14 },
  tile: {
    width: 104,
    padding: 8,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
  },
  tileSelected: { backgroundColor: colors.forest800, borderColor: colors.forest800 },
  tileImg: { width: 56, height: 56, borderRadius: 28 },
  tileText: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 15, color: colors.forest900, textAlign: "center", marginTop: 6 },
  toggles: { flexDirection: "row", gap: 10, marginTop: 4 },
  toggle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: HIT,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  toggleText: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
});

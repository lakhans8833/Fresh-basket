import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Category, ProductSummary } from "@shared/types";
import { CartButton } from "@/components/CartButton";
import { CART_BAR_SPACE, CartBar } from "@/components/CartBar";
import { ProductGrid, ProductGridSkeleton } from "@/components/ProductGrid";
import { ProductImage } from "@/components/ProductImage";
import { SearchField } from "@/components/SearchField";
import { EmptyState, ErrorState } from "@/components/States";
import { useFetch } from "@/lib/useFetch";
import { colors, fonts, type } from "@/theme";

type Sort = "featured" | "price_asc" | "price_desc" | "name";
const SORTS: { key: Sort; label: string }[] = [
  { key: "featured", label: "Recommended" },
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

  const rail = [
    { key: "all", name: "All", imageUrl: "/images/site/tile-all.webp", on: !category && !seasonal, onPress: () => { setCategory(""); setSeasonal(false); } },
    ...(categories.data?.categories ?? []).map((c) => ({
      key: c.id, name: c.name, imageUrl: c.imageUrl, on: category === c.slug, onPress: () => { setCategory(c.slug); setSeasonal(false); },
    })),
    { key: "seasonal", name: "In season", imageUrl: "/images/site/tile-seasonal.webp", on: seasonal && !category, onPress: () => { setCategory(""); setSeasonal(true); } },
  ];
  const count = products.data?.products.length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ivory, paddingTop: insets.top + 8 }}>
      <View style={styles.pad}>
        <View style={styles.titleRow}>
          <Text style={[type.h1, { flex: 1 }]} accessibilityRole="header" numberOfLines={1}>
            {activeCat ? activeCat.name : seasonal ? "In season now" : "All products"}
          </Text>
          <CartButton />
        </View>
        <SearchField value={q} onChangeText={setQ} onSubmit={() => setDebouncedQ(q.trim())} />
      </View>

      <View style={styles.body}>
        {/* Category rail: photo + name, the current one marked with a green bar (as on the website). */}
        {categories.error ? null : (
          <ScrollView style={styles.rail} contentContainerStyle={{ paddingBottom: CART_BAR_SPACE }} showsVerticalScrollIndicator={false}>
            {rail.map((c) => (
              <CategoryTile key={c.key} name={c.name} imageUrl={c.imageUrl} selected={c.on} onPress={c.onPress} />
            ))}
          </ScrollView>
        )}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: 24 + CART_BAR_SPACE }}
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
          {categories.error ? <ErrorState compact message={categories.error} onRetry={categories.reload} /> : null}
          {/* Filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 8 }}>
            {SORTS.map((s) => (
              <SmallChip key={s.key} label={s.label} selected={sort === s.key} onPress={() => setSort(s.key)} />
            ))}
            <SmallChip label="In stock" selected={inStock} onPress={() => setInStock(!inStock)} />
          </ScrollView>

          {products.error ? (
            <ErrorState message={products.error} onRetry={products.reload} />
          ) : products.loading && !products.data ? (
            <ProductGridSkeleton count={6} />
          ) : products.data && count > 0 ? (
            <>
              <Text style={[type.small, { marginBottom: 8 }]} accessibilityLiveRegion="polite">
                {count} item{count === 1 ? "" : "s"}
                {debouncedQ ? ` for “${debouncedQ}”` : ""}
              </Text>
              <ProductGrid products={products.data.products} gap={8} />
            </>
          ) : (
            <EmptyState
              title="No products found"
              message={debouncedQ ? `We couldn't find anything matching “${debouncedQ}”.` : "Nothing matches these filters right now."}
              actionLabel={hasFilters ? "Clear filters" : undefined}
              onAction={hasFilters ? clearAll : undefined}
            />
          )}
        </ScrollView>
      </View>
      <CartBar />
    </View>
  );
}

function SmallChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={{ top: 5, bottom: 5 }}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && { opacity: 0.75 }]}
    >
      <Text style={[styles.chipText, selected && { color: colors.forest800 }]}>{label}</Text>
    </Pressable>
  );
}

function CategoryTile({ name, imageUrl, selected, onPress }: { name: string; imageUrl: string | null; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={name}
      style={({ pressed }) => [styles.tile, selected && styles.tileSelected, pressed && { opacity: 0.75 }]}
    >
      <ProductImage uri={imageUrl} style={[styles.tileImg, selected && { borderColor: colors.leaf600, borderWidth: 2 }]} tint={colors.lime50} />
      <Text style={[styles.tileText, selected && { color: colors.forest800, fontFamily: fonts.bold }]} numberOfLines={2}>
        {name}
      </Text>
      {selected ? <View style={styles.tileBar} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 },
  body: { flex: 1, flexDirection: "row", marginTop: 10, borderTopWidth: 1, borderTopColor: colors.line },
  rail: { width: 80, flexGrow: 0, backgroundColor: colors.white, borderRightWidth: 1, borderRightColor: colors.line },
  tile: { alignItems: "center", paddingVertical: 10, paddingHorizontal: 4 },
  tileSelected: { backgroundColor: colors.lime50 },
  tileImg: { width: 50, height: 50, borderRadius: 12 },
  tileText: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 13.5, color: colors.inkSoft, textAlign: "center", marginTop: 5 },
  tileBar: { position: "absolute", right: 0, top: 10, bottom: 10, width: 4, borderTopLeftRadius: 4, borderBottomLeftRadius: 4, backgroundColor: colors.leaf600 },
  chip: { height: 34, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, justifyContent: "center" },
  chipOn: { borderColor: colors.leaf600, backgroundColor: colors.lime50 },
  chipText: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.inkSoft },
});

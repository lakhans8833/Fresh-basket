import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronRight, Clock, MapPin } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Category, ProductSummary } from "@shared/types";
import { percentOff } from "@shared/variants";
import { CART_BAR_SPACE, CartBar } from "@/components/CartBar";
import { CartButton } from "@/components/CartButton";
import { LocationSheet } from "@/components/LocationPicker";
import { Logo } from "@/components/Logo";
import { ProductCard } from "@/components/ProductCard";
import { ProductImage } from "@/components/ProductImage";
import { SearchField } from "@/components/SearchField";
import { SectionHeader } from "@/components/SectionHeader";
import { Skeleton } from "@/components/Skeleton";
import { ErrorState } from "@/components/States";
import { useCart } from "@/lib/cart";
import { HERO_IMAGE } from "@/lib/config";
import { useSettings } from "@/lib/settings";
import { useNextSlotLabel } from "@/lib/slots";
import { useFetch } from "@/lib/useFetch";
import { colors, fonts, radius } from "@/theme";

/** Rows open on what a shopper can buy and see: in stock first, then with a photo (same rule as the website). */
const browseFirst = (list: ProductSummary[]) =>
  [...list].sort((a, b) => Number(b.inStock) - Number(a.inStock) || Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)));
const hasDeal = (p: ProductSummary) => p.variants.some((v) => v.stock > 0 && percentOff(v.price, v.mrp) !== null);

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { settings } = useSettings();
  const { location } = useCart();
  const slot = useNextSlotLabel();
  const [query, setQuery] = useState("");
  const [locOpen, setLocOpen] = useState(false);
  const all = useFetch<{ products: ProductSummary[] }>("/api/products");
  const categories = useFetch<{ categories: Category[] }>("/api/categories");
  const refreshing = all.refreshing || categories.refreshing;
  const onRefresh = () => {
    void all.refresh();
    void categories.refresh();
  };

  const products = useMemo(() => all.data?.products ?? [], [all.data]);
  const cats = useMemo(() => (categories.data?.categories ?? []).filter((c) => (c.productCount ?? 0) > 0), [categories.data]);
  const popular = useMemo(() => browseFirst([...products.filter((p) => p.featured), ...products.filter((p) => !p.featured)]).filter((p) => p.inStock).slice(0, 12), [products]);
  const deals = useMemo(() => browseFirst(products.filter(hasDeal)).slice(0, 14), [products]);
  const seasonal = useMemo(() => browseFirst(products.filter((p) => p.seasonal)).slice(0, 14), [products]);
  const seasonalCount = products.filter((p) => p.seasonal).length;

  const goCategory = (slug?: string) => router.push({ pathname: "/categories", params: slug ? { category: slug } : { category: "" } });
  const submitSearch = () => router.push({ pathname: "/categories", params: { q: query.trim() } });
  // 4 tiles per row with 10 px gaps inside 16 px side padding.
  const tileW = Math.floor((Math.min(width, 520) - 32 - 30) / 4);

  const rail = (id: string, title: string, list: ProductSummary[], onAll: () => void) =>
    list.length ? (
      <View key={id} style={{ marginTop: 22 }}>
        <View style={styles.pad}>
          <SectionHeader title={title} actionLabel="see all" onAction={onAll} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {list.map((p) => (
            <View key={p.id} style={{ width: 150 }}>
              <ProductCard product={p} />
            </View>
          ))}
        </ScrollView>
      </View>
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ivory }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: 24 + CART_BAR_SPACE }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.leaf600} colors={[colors.leaf600]} />}
      >
        <View style={styles.pad}>
          <View style={styles.header}>
            <Logo />
            <CartButton />
          </View>

          {/* Next slot + delivery area (like the website header) */}
          <Pressable
            onPress={() => setLocOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`${slot ? `Delivery ${slot}. ` : ""}${location ? `Delivering to ${location.areaName}` : "Set your PIN code"}. Change delivery location`}
            style={({ pressed }) => [styles.delivery, pressed && { opacity: 0.75 }]}
          >
            <View style={styles.deliveryArea}>
              <Clock size={16} color={colors.leaf600} />
              <Text style={styles.deliveryTitle} numberOfLines={1}>
                {slot ? `Delivery ${slot}` : "Choose a delivery slot at checkout"}
              </Text>
            </View>
            <View style={styles.deliveryArea}>
              <MapPin size={14} color={colors.muted} />
              <Text style={styles.deliveryAreaText} numberOfLines={1}>
                {location ? `${location.areaName}, ${location.city} · ${location.pincode}` : "Set your PIN code"}
              </Text>
              <ChevronDown size={15} color={colors.ink} />
            </View>
          </Pressable>

          <SearchField value={query} onChangeText={setQuery} onSubmit={submitSearch} />

          {settings?.announcement ? (
            <View style={styles.announce}>
              <Text style={styles.announceText}>{settings.announcement}</Text>
            </View>
          ) : null}

          {/* Compact banner */}
          <Pressable onPress={() => goCategory()} accessibilityRole="button" accessibilityLabel="Shop fresh vegetables" style={styles.hero}>
            <Image source={{ uri: HERO_IMAGE }} style={StyleSheet.absoluteFill} contentFit="cover" />
            <View style={styles.heroShade} />
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>Fresh vegetables{"\n"}delivered to your home</Text>
              <Text style={styles.heroSub} numberOfLines={1}>{settings?.tagline || "Fresh Vegetables, Healthy Life"}</Text>
              <View style={styles.heroBtn}>
                <Text style={styles.heroBtnText}>Shop now</Text>
                <ChevronRight size={16} color={colors.white} />
              </View>
            </View>
          </Pressable>
        </View>

        {/* Category tiles */}
        <View style={[styles.pad, { marginTop: 20 }]}>
          <SectionHeader title="Shop by category" actionLabel="see all" onAction={() => goCategory()} />
          {categories.error ? (
            <ErrorState compact message={categories.error} onRetry={categories.reload} />
          ) : (
            <View style={styles.tiles}>
              {categories.loading && !categories.data
                ? Array.from({ length: 8 }).map((_, i) => (
                    <View key={i} style={{ width: tileW }}>
                      <Skeleton width={tileW} height={tileW} r={12} />
                      <Skeleton width={tileW - 10} height={10} style={{ marginTop: 6 }} />
                    </View>
                  ))
                : [
                    ...cats.map((c) => ({ key: c.id, name: c.name, image: c.imageUrl, onPress: () => goCategory(c.slug) })),
                    ...(seasonalCount
                      ? [{ key: "seasonal", name: "In Season Now", image: "/images/site/tile-seasonal.webp", onPress: () => router.push({ pathname: "/categories", params: { seasonal: "1" } }) }]
                      : []),
                  ].map((t) => (
                    <Pressable key={t.key} onPress={t.onPress} accessibilityRole="button" accessibilityLabel={t.name} style={({ pressed }) => [{ width: tileW }, pressed && { opacity: 0.7 }]}>
                      <ProductImage uri={t.image} tint={colors.lime50} style={[styles.tileImg, { width: tileW, height: tileW }]} />
                      <Text style={styles.tileText} numberOfLines={2}>
                        {t.name}
                      </Text>
                    </Pressable>
                  ))}
            </View>
          )}
        </View>

        {all.error ? (
          <View style={[styles.pad, { marginTop: 20 }]}>
            <ErrorState message={all.error} onRetry={all.reload} />
          </View>
        ) : all.loading && !all.data ? (
          <View style={[styles.pad, { marginTop: 22, flexDirection: "row", gap: 10 }]}>
            <Skeleton width={150} height={250} r={12} />
            <Skeleton width={150} height={250} r={12} />
          </View>
        ) : (
          <>
            {rail("popular", "Popular picks", popular, () => goCategory())}
            {rail("deals", "Deals of the Day", deals, () => goCategory())}
            {cats.map((c) => rail(`cat-${c.id}`, c.name, browseFirst(products.filter((p) => p.categoryId === c.id)).slice(0, 14), () => goCategory(c.slug)))}
            {rail("seasonal", "In Season Now", seasonal, () => router.push({ pathname: "/categories", params: { seasonal: "1" } }))}
          </>
        )}
      </ScrollView>
      <CartBar />
      <LocationSheet visible={locOpen} onClose={() => setLocOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  delivery: { marginBottom: 10 },
  deliveryTitle: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink, flexShrink: 1 },
  deliveryArea: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  deliveryAreaText: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkSoft, flexShrink: 1 },
  announce: { backgroundColor: colors.forest800, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, marginTop: 10 },
  announceText: { color: colors.white, fontFamily: fonts.medium, fontSize: 12.5, textAlign: "center" },
  hero: { marginTop: 12, height: 150, borderRadius: 16, overflow: "hidden", backgroundColor: colors.lime100 },
  heroShade: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(242,249,233,0.72)" },
  heroText: { flex: 1, padding: 14, justifyContent: "center" },
  heroTitle: { fontFamily: fonts.display, fontSize: 19, lineHeight: 23, color: colors.forest800 },
  heroSub: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.inkSoft, marginTop: 4 },
  heroBtn: { marginTop: 10, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.forest800, borderRadius: 8, paddingHorizontal: 12, height: 36 },
  heroBtnText: { color: colors.white, fontFamily: fonts.semibold, fontSize: 13.5 },
  tiles: { flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 14 },
  tileImg: { borderRadius: 12, borderWidth: 1, borderColor: colors.lime100 },
  tileText: { fontFamily: fonts.semibold, fontSize: 11.5, lineHeight: 14, color: colors.ink, textAlign: "center", marginTop: 5 },
  rail: { paddingHorizontal: 16, gap: 10, paddingBottom: 4, paddingTop: 2 },
});

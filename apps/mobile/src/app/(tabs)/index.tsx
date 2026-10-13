import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { ArrowRight, Bell } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Category, ProductSummary } from "@shared/types";
import { CartButton } from "@/components/CartButton";
import { IconButton } from "@/components/IconButton";
import { LocationRow } from "@/components/LocationPicker";
import { Logo } from "@/components/Logo";
import { ProductCard } from "@/components/ProductCard";
import { ProductGrid, ProductGridSkeleton } from "@/components/ProductGrid";
import { ProductImage } from "@/components/ProductImage";
import { SearchField } from "@/components/SearchField";
import { SectionHeader } from "@/components/SectionHeader";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState, ErrorState } from "@/components/States";
import { HERO_IMAGE } from "@/lib/config";
import { useFetch } from "@/lib/useFetch";
import { useSettings } from "@/lib/settings";
import { colors, fonts, radius, type } from "@/theme";

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { settings } = useSettings();
  const [query, setQuery] = useState("");
  const featured = useFetch<{ products: ProductSummary[] }>("/api/products?featured=1");
  const seasonal = useFetch<{ products: ProductSummary[] }>("/api/products?seasonal=1");
  const categories = useFetch<{ categories: Category[] }>("/api/categories");
  const refreshing = featured.refreshing || seasonal.refreshing || categories.refreshing;

  const onRefresh = () => {
    void featured.refresh();
    void seasonal.refresh();
    void categories.refresh();
  };

  const goCategory = (slug?: string) =>
    router.push({ pathname: "/categories", params: slug ? { category: slug } : { category: "" } });
  const submitSearch = () => router.push({ pathname: "/categories", params: { q: query.trim() } });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.ivory }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.leaf600} colors={[colors.leaf600]} />}
    >
      <View style={styles.pad}>
        <View style={styles.header}>
          <Logo />
          <View style={styles.headerIcons}>
            <IconButton label="Order updates" onPress={() => router.push("/orders")}>
              <Bell size={22} color={colors.forest900} strokeWidth={1.8} />
            </IconButton>
            <CartButton />
          </View>
        </View>

        {settings?.announcement ? (
          <View style={styles.announce}>
            <Text style={styles.announceText}>{settings.announcement}</Text>
          </View>
        ) : null}

        <LocationRow />
        <View style={{ marginTop: 8 }}>
          <SearchField value={query} onChangeText={setQuery} onSubmit={submitSearch} />
        </View>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroText}>
            <Text style={[type.eyebrow, { color: colors.leaf600 }]}>Doorstep delivery</Text>
            <Text style={styles.heroTitle}>Freshness at your doorstep.</Text>
            <Text style={styles.heroSub} numberOfLines={3}>
              {settings?.tagline || "Your everyday vegetables, just a tap away."}
            </Text>
            <Pressable
              onPress={() => goCategory()}
              accessibilityRole="button"
              accessibilityLabel="Shop fresh vegetables"
              style={({ pressed }) => [styles.heroBtn, pressed && { backgroundColor: "#336d2b" }]}
            >
              <Text style={styles.heroBtnText}>Shop fresh</Text>
              <ArrowRight size={17} color={colors.white} />
            </Pressable>
          </View>
          <Image
            source={{ uri: HERO_IMAGE }}
            style={styles.heroImage}
            contentFit="cover"
            accessibilityLabel="A basket of fresh vegetables"
          />
        </View>
      </View>

      {/* Categories */}
      <View style={{ marginTop: 24 }}>
        <View style={styles.pad}>
          <SectionHeader title="Shop by category" actionLabel="See all" onAction={() => goCategory()} />
        </View>
        {categories.error ? (
          <ErrorState compact message={categories.error} onRetry={categories.reload} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
            {categories.loading && !categories.data
              ? Array.from({ length: 4 }).map((_, i) => (
                  <View key={i} style={styles.cat}>
                    <Skeleton width={68} height={68} r={34} />
                    <Skeleton width={56} height={10} style={{ marginTop: 8 }} />
                  </View>
                ))
              : [
                  { id: "all", slug: "", name: "All vegetables", imageUrl: categories.data?.categories[0]?.imageUrl ?? null },
                  ...(categories.data?.categories ?? []),
                ].map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => goCategory(c.slug || undefined)}
                    accessibilityRole="button"
                    accessibilityLabel={c.name}
                    style={({ pressed }) => [styles.cat, pressed && { opacity: 0.7 }]}
                  >
                    <ProductImage uri={c.imageUrl} style={styles.catImg} tint={colors.lime100} />
                    <Text style={styles.catLabel} numberOfLines={2}>
                      {c.name}
                    </Text>
                  </Pressable>
                ))}
          </ScrollView>
        )}
      </View>

      {/* Featured */}
      <View style={[styles.pad, { marginTop: 22 }]}>
        <SectionHeader title="Fresh favourites" actionLabel="View all" onAction={() => goCategory()} />
        {featured.error ? (
          <ErrorState compact message={featured.error} onRetry={featured.reload} />
        ) : featured.loading && !featured.data ? (
          <ProductGridSkeleton />
        ) : featured.data && featured.data.products.length > 0 ? (
          <ProductGrid products={featured.data.products} />
        ) : (
          <EmptyState title="Nothing featured yet" message="Browse all vegetables instead." actionLabel="Browse" onAction={() => goCategory()} />
        )}
      </View>

      {/* Seasonal */}
      {seasonal.data && seasonal.data.products.length > 0 ? (
        <View style={{ marginTop: 28 }}>
          <View style={styles.pad}>
            <SectionHeader
              eyebrow="Seasonal picks"
              title="In season now"
              actionLabel="View all"
              onAction={() => router.push({ pathname: "/categories", params: { seasonal: "1" } })}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonRow}>
            {seasonal.data.products.map((p, i) => (
              <View key={p.id} style={{ width: 172 }}>
                <ProductCard product={p} index={i + 1} />
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 16 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  headerIcons: { flexDirection: "row", alignItems: "center", gap: 2 },
  announce: { backgroundColor: colors.forest900, borderRadius: radius.md, padding: 10, marginBottom: 6 },
  announceText: { color: colors.lime200, fontFamily: fonts.medium, fontSize: 13, textAlign: "center" },
  hero: {
    marginTop: 16,
    backgroundColor: colors.lime100,
    borderRadius: radius.xl,
    overflow: "hidden",
    flexDirection: "row",
    minHeight: 220,
  },
  heroText: { flex: 1.15, padding: 18, paddingRight: 6, justifyContent: "center" },
  heroTitle: { fontFamily: fonts.serif, fontSize: 27, lineHeight: 30, color: colors.forest900, marginTop: 8, letterSpacing: -0.5 },
  heroSub: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.inkSoft, marginTop: 8 },
  heroBtn: {
    marginTop: 14,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.leaf600,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    minHeight: 44,
  },
  heroBtnText: { color: colors.white, fontFamily: fonts.semibold, fontSize: 14 },
  heroImage: { flex: 1, minHeight: 220 },
  catRow: { paddingHorizontal: 16, gap: 10 },
  cat: { width: 80, alignItems: "center" },
  catImg: { width: 68, height: 68, borderRadius: 34, borderWidth: 2, borderColor: colors.white },
  catLabel: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 15, color: colors.ink, textAlign: "center", marginTop: 6 },
  seasonRow: { paddingHorizontal: 16, gap: 12 },
});

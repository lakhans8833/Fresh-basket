import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Check, Heart } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatINR } from "@shared/money";
import { MAX_QTY_PER_LINE } from "@shared/pricing";
import type { ProductDetail } from "@shared/types";
import { Button } from "@/components/Button";
import { CartButton } from "@/components/CartButton";
import { IconButton } from "@/components/IconButton";
import { ProductImage } from "@/components/ProductImage";
import { QuantityStepper } from "@/components/QuantityStepper";
import { Skeleton } from "@/components/Skeleton";
import { ErrorState, InlineMessage } from "@/components/States";
import { useCart } from "@/lib/cart";
import { useFavourites } from "@/lib/favourites";
import { useFetch } from "@/lib/useFetch";
import { colors, fonts, HIT, radius, type } from "@/theme";

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const cart = useCart();
  const fav = useFavourites();
  const { data, error, loading, reload } = useFetch<{ product: ProductDetail }>(
    slug ? `/api/products/${encodeURIComponent(slug)}` : null,
  );
  const product = data?.product;

  const activeVariants = useMemo(() => product?.variants.filter((v) => v.active) ?? [], [product]);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [page, setPage] = useState(0);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (!product) return;
    const first = activeVariants.find((v) => v.stock > 0) ?? activeVariants[0];
    setVariantId((cur) => (cur && activeVariants.some((v) => v.id === cur) ? cur : first?.id ?? null));
  }, [product, activeVariants]);

  const variant = activeVariants.find((v) => v.id === variantId) ?? null;
  const inCart = variant ? cart.quantityOf(variant.id) : 0;
  const maxQty = variant ? Math.max(0, Math.min(MAX_QTY_PER_LINE, variant.stock) - inCart) : 0;

  useEffect(() => {
    setQty((q) => Math.max(1, Math.min(q, maxQty || 1)));
  }, [maxQty]);

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 2200);
    return () => clearTimeout(t);
  }, [added]);

  const images = product
    ? product.images.length > 0
      ? product.images
      : [{ id: "main", url: product.imageUrl ?? "", alt: product.name }]
    : [];
  const imgHeight = Math.min(380, Math.round(width * 0.92));
  const liked = product ? fav.isFavourite(product.id) : false;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / width);
    if (p !== page) setPage(p);
  };

  const addToBasket = () => {
    if (!product || !variant || maxQty < 1) return;
    cart.add(
      {
        variantId: variant.id,
        productName: product.name,
        productSlug: product.slug,
        variantLabel: variant.label,
        imageUrl: product.imageUrl,
        priceHint: variant.price,
      },
      qty,
    );
    setAdded(true);
    setQty(1);
  };

  const stockMessage = !variant
    ? null
    : variant.stock <= 0
      ? { tone: "danger" as const, text: "Out of stock right now. Check back soon." }
      : maxQty <= 0
        ? { tone: "info" as const, text: `You have the maximum available (${inCart}) in your basket.` }
        : variant.stock <= 5
          ? { tone: "warning" as const, text: `Only ${variant.stock} left in stock.` }
          : null;

  const topBar = (
    <View style={[styles.topBar, { top: insets.top + 6 }]} pointerEvents="box-none">
      <IconButton label="Go back" variant="soft" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
        <ArrowLeft size={21} color={colors.forest900} />
      </IconButton>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {product ? (
          <IconButton
            label={liked ? "Remove from favourites" : "Save to favourites"}
            variant="soft"
            selected={liked}
            onPress={() => fav.toggle(product.id)}
          >
            <Heart size={20} color={liked ? colors.tomato : colors.forest900} fill={liked ? colors.tomato : "transparent"} />
          </IconButton>
        ) : null}
        <CartButton variant="soft" />
      </View>
    </View>
  );

  if (error && !product) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + 64 }]}>
        {topBar}
        <ErrorState message={error} onRetry={reload} />
      </View>
    );
  }

  if (loading || !product) {
    return (
      <View style={styles.flex}>
        <Skeleton height={imgHeight + insets.top} r={0} />
        <View style={{ padding: 20, gap: 12 }}>
          <Skeleton width="60%" height={28} />
          <Skeleton width="35%" height={18} />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Skeleton width={110} height={64} r={radius.md} />
            <Skeleton width={110} height={64} r={radius.md} />
          </View>
          <Skeleton height={14} style={{ marginTop: 16 }} />
          <Skeleton height={14} width="80%" />
        </View>
        {topBar}
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        {/* Gallery */}
        <View style={{ height: imgHeight + insets.top, backgroundColor: colors.sage50 }}>
          {images.length > 1 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={32}
              accessibilityLabel={`Photo gallery, ${images.length} photos`}
            >
              {images.map((img) => (
                <ProductImage
                  key={img.id}
                  uri={img.url}
                  alt={img.alt ?? product.name}
                  style={{ width, height: imgHeight + insets.top }}
                />
              ))}
            </ScrollView>
          ) : (
            <ProductImage uri={images[0]?.url} alt={images[0]?.alt ?? product.name} style={{ width, height: imgHeight + insets.top }} />
          )}
          {images.length > 1 ? (
            <View style={styles.dots} accessibilityLabel={`Photo ${page + 1} of ${images.length}`}>
              {images.map((img, i) => (
                <View key={img.id} style={[styles.dot, i === page && styles.dotActive]} />
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          <Text style={type.eyebrow}>{product.categoryName}{product.seasonal ? " · In season" : ""}</Text>
          <Text style={[type.h1, { fontSize: 30, lineHeight: 36, marginTop: 6 }]} accessibilityRole="header">
            {product.name}
          </Text>
          {variant ? (
            <Text style={styles.priceLine}>
              <Text style={styles.price}>{formatINR(variant.price)}</Text>
              <Text style={styles.per}> / {variant.label}{variant.note ? ` (${variant.note})` : ""}</Text>
              {variant.mrp && variant.mrp > variant.price ? <Text style={styles.mrp}>  {formatINR(variant.mrp)}</Text> : null}
            </Text>
          ) : (
            <Text style={[type.body, { marginTop: 8 }]}>Currently unavailable.</Text>
          )}

          {activeVariants.length > 0 ? (
            <>
              <Text style={styles.label}>Choose weight</Text>
              <View style={styles.tiles} accessibilityRole="radiogroup">
                {activeVariants.map((v) => {
                  const selected = v.id === variantId;
                  const out = v.stock <= 0;
                  return (
                    <Pressable
                      key={v.id}
                      onPress={() => setVariantId(v.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, checked: selected, disabled: out }}
                      accessibilityLabel={`${v.label}, ${formatINR(v.price)}${out ? ", out of stock" : ""}`}
                      style={({ pressed }) => [
                        styles.tile,
                        selected && styles.tileSelected,
                        out && styles.tileOut,
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <Text style={[styles.tileLabel, selected && { color: colors.ivory }]}>{v.label}</Text>
                      <Text style={[styles.tilePrice, selected && { color: colors.lime200 }]}>
                        {out ? "Sold out" : formatINR(v.price)}
                      </Text>
                      {v.note ? (
                        <Text style={[styles.tilePrice, { fontSize: 11, opacity: 0.85 }, selected && { color: colors.lime200 }]} numberOfLines={1}>
                          {v.note}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {stockMessage ? (
            <View style={{ marginTop: 14 }}>
              <InlineMessage tone={stockMessage.tone}>{stockMessage.text}</InlineMessage>
            </View>
          ) : null}

          {variant && maxQty > 0 ? (
            <View style={styles.qtyRow}>
              <Text style={styles.label}>Quantity</Text>
              <QuantityStepper value={qty} onChange={setQty} max={maxQty} itemName={product.name} />
            </View>
          ) : null}
          {inCart > 0 ? (
            <Text style={[type.small, { marginTop: 8 }]}>
              {inCart} × {variant?.label} already in your basket
            </Text>
          ) : null}

          {product.description || product.highlights.length > 0 ? (
            <View style={{ marginTop: 26 }}>
              <Text style={type.h3} accessibilityRole="header">
                About this product
              </Text>
              {product.description ? <Text style={[type.body, { marginTop: 8 }]}>{product.description}</Text> : null}
              {product.highlights.length > 0 ? (
                <View style={styles.highlights}>
                  {product.highlights.map((h) => (
                    <View key={h} style={styles.highlight}>
                      <Check size={14} color={colors.leaf600} />
                      <Text style={styles.highlightText}>{h}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {topBar}

      {/* Pinned add-to-basket */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {added ? (
          <View style={styles.addedRow} accessibilityLiveRegion="polite">
            <Text style={styles.addedText}>Added to basket</Text>
            <Button label="View basket" variant="lime" size="sm" onPress={() => router.push("/cart")} />
          </View>
        ) : null}
        <Button
          label={
            !variant || variant.stock <= 0
              ? "Out of stock"
              : maxQty <= 0
                ? "Maximum in basket"
                : `Add to basket · ${formatINR(variant.price * qty)}`
          }
          variant="dark"
          size="lg"
          fullWidth
          disabled={!variant || maxQty <= 0}
          onPress={addToBasket}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ivory },
  topBar: { position: "absolute", left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" },
  dots: { position: "absolute", bottom: 22, alignSelf: "center", flexDirection: "row", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.6)" },
  dotActive: { backgroundColor: colors.white, width: 18 },
  body: {
    marginTop: -20,
    backgroundColor: colors.ivory,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  priceLine: { marginTop: 8 },
  price: { fontFamily: fonts.bold, fontSize: 22, color: colors.forest900 },
  per: { fontFamily: fonts.regular, fontSize: 15, color: colors.muted },
  mrp: { fontFamily: fonts.regular, fontSize: 14, color: colors.muted, textDecorationLine: "line-through" },
  label: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink, marginTop: 22, marginBottom: 10 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    minWidth: 104,
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
    justifyContent: "center",
  },
  tileSelected: { backgroundColor: colors.forest800, borderColor: colors.forest800 },
  tileOut: { opacity: 0.55, borderStyle: "dashed" },
  tileLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.forest900 },
  tilePrice: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, marginTop: 2 },
  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  highlights: { marginTop: 12, gap: 8 },
  highlight: { flexDirection: "row", alignItems: "center", gap: 8 },
  highlightText: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkSoft },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.ivory,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  addedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    minHeight: HIT,
  },
  addedText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.leaf600 },
});

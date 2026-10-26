import { useRouter } from "expo-router";
import { Heart } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { unitPriceLabel } from "@shared/catalog-search";
import { formatINR } from "@shared/money";
import { MAX_QTY_PER_LINE } from "@shared/pricing";
import { addablePacks } from "@shared/stock";
import type { ProductSummary } from "@shared/types";
import { defaultVariant, percentOff } from "@shared/variants";
import { useCart } from "@/lib/cart";
import { useFavourites } from "@/lib/favourites";
import { colors, fonts, radius } from "@/theme";
import { ProductImage } from "./ProductImage";
import { QuantityStepper } from "./QuantityStepper";

/**
 * Quick-commerce product card (same layout as the website): square photo with "% OFF", name, pack,
 * price with the MRP struck through, and a small ADD that turns into a green − N + stepper.
 */
export function ProductCard({ product }: { product: ProductSummary; index?: number }) {
  const router = useRouter();
  const cart = useCart();
  const fav = useFavourites();
  // Same pack as the website opens on: 500 g when in stock, else the first size in stock.
  const variant = defaultVariant(product.variants);
  const inCart = variant ? cart.quantityOf(variant.id) : 0;
  // Weight products: every pack size draws from one total, so packs of other sizes in the basket count too.
  const canAdd = variant ? addablePacks(product, variant.id, (id) => cart.quantityOf(id), MAX_QTY_PER_LINE) : 0;
  const soldOut = !product.inStock || !variant || variant.stock <= 0;
  const liked = fav.isFavourite(product.id);
  const pct = variant ? percentOff(variant.price, variant.mrp) : null;
  const sub = variant ? [variant.note, unitPriceLabel(variant.price, variant.label)].filter(Boolean).join(" · ") : "";
  const open = () => router.push({ pathname: "/product/[slug]", params: { slug: product.slug } });

  const add = () => {
    if (!variant || canAdd <= 0) return;
    cart.add({
      variantId: variant.id,
      productName: product.name,
      productSlug: product.slug,
      variantLabel: variant.label,
      imageUrl: product.imageUrl,
      priceHint: variant.price,
    });
  };

  return (
    <View style={[styles.card, soldOut && { backgroundColor: colors.sage50 }]}>
      <Pressable
        onPress={open}
        accessibilityRole="link"
        accessibilityLabel={`${product.name}, ${variant?.label ?? ""}, ${variant ? formatINR(variant.price) : ""}${pct ? `, ${pct}% off` : ""}${soldOut ? ", out of stock" : ""}`}
        style={({ pressed }) => pressed && { opacity: 0.85 }}
      >
        <View>
          <ProductImage uri={product.imageUrl} alt={product.name} tint={colors.lime50} style={[styles.image, soldOut && { opacity: 0.5 }]} />
          {pct ? (
            <View style={styles.off}>
              <Text style={styles.offText}>{pct}% OFF</Text>
            </View>
          ) : null}
          {soldOut ? (
            <View style={styles.outPill}>
              <Text style={styles.outText}>Out of stock</Text>
            </View>
          ) : product.seasonal ? (
            <View style={styles.season}>
              <Text style={styles.seasonText}>IN SEASON</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={styles.pack} numberOfLines={1}>
          {variant?.label}
          {product.variants.length > 1 ? `  ·  ${product.variants.length} sizes` : ""}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {!soldOut && variant && variant.stock <= 5 ? <Text style={{ color: colors.amber }}>Only {variant.stock} left{sub ? " · " : ""}</Text> : null}
          {sub}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => fav.toggle(product.id)}
        accessibilityRole="button"
        accessibilityLabel={liked ? `Remove ${product.name} from favourites` : `Save ${product.name} to favourites`}
        accessibilityState={{ selected: liked }}
        hitSlop={6}
        style={styles.heart}
      >
        <Heart size={16} color={liked ? colors.tomato : colors.forest900} fill={liked ? colors.tomato : "transparent"} />
      </Pressable>
      <View style={styles.bottom}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.price}>{variant ? formatINR(variant.price) : "—"}</Text>
          {variant?.mrp && variant.mrp > variant.price ? <Text style={styles.mrp}>{formatINR(variant.mrp)}</Text> : null}
        </View>
        {soldOut ? null : inCart > 0 && variant ? (
          <QuantityStepper
            size="xs"
            tone="solid"
            value={inCart}
            max={inCart + canAdd}
            onChange={(q) => cart.setQuantity(variant.id, q)}
            itemName={product.name}
            allowRemove
          />
        ) : (
          <Pressable
            onPress={add}
            disabled={canAdd <= 0}
            accessibilityRole="button"
            accessibilityLabel={`Add ${product.name} ${variant?.label ?? ""} to basket`}
            accessibilityState={{ disabled: canAdd <= 0 }}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            style={({ pressed }) => [styles.add, pressed && { backgroundColor: colors.leaf600 }, canAdd <= 0 && { opacity: 0.5 }]}
          >
            {({ pressed }) => <Text style={[styles.addText, pressed && { color: colors.white }]}>{canAdd <= 0 ? "MAX" : "ADD"}</Text>}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  image: { aspectRatio: 1, width: "100%", borderRadius: 10 },
  off: {
    position: "absolute",
    top: 6,
    left: -8,
    backgroundColor: colors.offer,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
  },
  offText: { fontFamily: fonts.bold, fontSize: 10, color: colors.white, letterSpacing: 0.3 },
  season: { position: "absolute", left: 4, bottom: 4, backgroundColor: "rgba(11,102,35,0.92)", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  seasonText: { fontFamily: fonts.bold, fontSize: 9, color: colors.white, letterSpacing: 0.4 },
  outPill: { position: "absolute", bottom: 6, alignSelf: "center", backgroundColor: "rgba(19,35,26,0.8)", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  outText: { fontFamily: fonts.semibold, fontSize: 10, color: colors.white },
  heart: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontFamily: fonts.semibold, fontSize: 13.5, lineHeight: 17, minHeight: 34, color: colors.ink, marginTop: 6 },
  pack: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2 },
  sub: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, minHeight: 14 },
  bottom: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 6, gap: 4, minHeight: 36 },
  price: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  mrp: { fontFamily: fonts.regular, fontSize: 11, color: colors.muted, textDecorationLine: "line-through" },
  add: {
    borderWidth: 1,
    borderColor: colors.leaf600,
    backgroundColor: colors.lime50,
    borderRadius: 8,
    height: 34,
    minWidth: 68,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  addText: { fontFamily: fonts.bold, fontSize: 13, color: colors.leaf600, letterSpacing: 0.4 },
});

import { useRouter } from "expo-router";
import { Heart, Plus } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { formatINR } from "@shared/money";
import type { ProductSummary } from "@shared/types";
import { useCart } from "@/lib/cart";
import { useFavourites } from "@/lib/favourites";
import { colors, fonts, HIT, radius } from "@/theme";
import { ProductImage } from "./ProductImage";
import { QuantityStepper } from "./QuantityStepper";

const TINTS = [colors.sage50, colors.lime100, "#f6f1e4", colors.sage100];

export function ProductCard({ product, index = 0 }: { product: ProductSummary; index?: number }) {
  const router = useRouter();
  const cart = useCart();
  const fav = useFavourites();
  const variant =
    product.variants.find((v) => v.active && v.stock > 0) ?? product.variants.find((v) => v.active) ?? product.variants[0];
  const inCart = variant ? cart.quantityOf(variant.id) : 0;
  const soldOut = !product.inStock || !variant || variant.stock <= 0;
  const liked = fav.isFavourite(product.id);
  const open = () => router.push({ pathname: "/product/[slug]", params: { slug: product.slug } });

  const add = () => {
    if (!variant) return;
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
    <View style={styles.card}>
      <Pressable
        onPress={open}
        accessibilityRole="link"
        accessibilityLabel={`${product.name}, ${variant?.label ?? ""}, ${variant ? formatINR(variant.price) : ""}${soldOut ? ", out of stock" : ""}`}
        style={({ pressed }) => pressed && { opacity: 0.85 }}
      >
        <ProductImage uri={product.imageUrl} alt={product.name} tint={TINTS[index % TINTS.length]} style={styles.image} />
        {product.seasonal ? (
          <View style={styles.tag}>
            <Text style={styles.tagText}>In season</Text>
          </View>
        ) : null}
        <Text style={styles.name} numberOfLines={1}>
          {product.name}
        </Text>
        <Text style={styles.weight} numberOfLines={1}>
          {variant?.label}
          {product.variants.length > 1 ? ` · ${product.variants.length} sizes` : ""}
        </Text>
      </Pressable>
      <Pressable
        onPress={() => fav.toggle(product.id)}
        accessibilityRole="button"
        accessibilityLabel={liked ? `Remove ${product.name} from favourites` : `Save ${product.name} to favourites`}
        accessibilityState={{ selected: liked }}
        hitSlop={4}
        style={styles.heart}
      >
        <Heart size={17} color={liked ? colors.tomato : colors.forest900} fill={liked ? colors.tomato : "transparent"} />
      </Pressable>
      <View style={styles.bottom}>
        <Text style={styles.price}>{variant ? formatINR(variant.price) : "—"}</Text>
        {soldOut ? (
          <Text style={styles.soldOut}>Sold out</Text>
        ) : inCart > 0 && variant ? (
          <QuantityStepper
            size="sm"
            value={inCart}
            max={Math.min(20, variant.stock)}
            onChange={(q) => cart.setQuantity(variant.id, q)}
            itemName={product.name}
            allowRemove
          />
        ) : (
          <Pressable
            onPress={add}
            accessibilityRole="button"
            accessibilityLabel={`Add ${product.name} ${variant?.label ?? ""} to basket`}
            style={({ pressed }) => [styles.add, pressed && { backgroundColor: colors.lime300 }]}
          >
            <Text style={styles.addText}>Add</Text>
            <Plus size={15} color={colors.forest900} strokeWidth={2.4} />
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
    borderRadius: radius.lg,
    padding: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  image: { height: 128, borderRadius: radius.md },
  tag: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  tagText: { fontFamily: fonts.semibold, fontSize: 10, color: colors.leaf600 },
  heart: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, marginTop: 10, paddingHorizontal: 4 },
  weight: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted, marginTop: 2, paddingHorizontal: 4 },
  bottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingLeft: 4,
    minHeight: HIT,
  },
  price: { fontFamily: fonts.bold, fontSize: 16, color: colors.forest900 },
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.lime200,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    minHeight: 38,
    minWidth: 72,
    justifyContent: "center",
  },
  addText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.forest900 },
  soldOut: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
});

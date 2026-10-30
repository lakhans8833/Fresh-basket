import { useRouter } from "expo-router";
import { ShoppingBasket, Ticket, X } from "lucide-react-native";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatINR } from "@shared/money";
import { MAX_QTY_PER_LINE } from "@shared/pricing";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { LocationRow } from "@/components/LocationPicker";
import { PriceRow } from "@/components/PriceRow";
import { ProductImage } from "@/components/ProductImage";
import { QuantityStepper } from "@/components/QuantityStepper";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Skeleton } from "@/components/Skeleton";
import { EmptyState, InlineMessage } from "@/components/States";
import { useCart } from "@/lib/cart";
import { colors, fonts, HIT, radius, type } from "@/theme";

export default function CartScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const [code, setCode] = useState("");
  const { quote: q, quoteLoading, quoteError } = cart;
  const quote = q?.quote;
  const messages = q?.messages ?? {};

  if (cart.hydrated && cart.lines.length === 0) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Your basket" />
        <EmptyState
          icon={<ShoppingBasket size={30} color={colors.leaf600} />}
          title="Your basket is empty"
          message="Add some fresh vegetables to get started."
          actionLabel="Shop fresh"
          onAction={() => router.replace("/categories")}
        />
      </View>
    );
  }

  const lineTotal = (variantId: string) => quote?.lines.find((l) => l.variantId === variantId)?.lineTotal;
  const cartLevelMessages = Object.entries(messages).filter(([k]) => k === "_cart" || k === "_slot");
  const couponMessage = messages._coupon;
  // Without a PIN code the server can't apply an area's minimum, so check the store-wide one here
  // (as the website does) instead of letting checkout refuse it later.
  const shortBy = !cart.location && quote && q?.minOrder ? q.minOrder - (quote.subtotal - quote.discount) : 0;
  const canCheckout = !!quote && quote.ok && !quoteLoading && !quoteError && shortBy <= 0;

  const applyCoupon = () => {
    const c = code.trim();
    if (c) cart.setCoupon(c);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenHeader title="Your basket" right={<Text style={type.small}>{cart.count} item{cart.count === 1 ? "" : "s"}</Text>} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 + insets.bottom, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Card style={{ paddingVertical: 6 }}>
          <LocationRow />
          {!cart.location ? (
            <Text style={[type.small, { marginBottom: 8 }]}>Set your PIN code to see delivery charges.</Text>
          ) : null}
        </Card>

        <View style={{ gap: 10 }}>
          {cart.lines.map((l) => {
            const total = lineTotal(l.variantId);
            const msg = messages[l.variantId];
            return (
              <View key={l.variantId} style={styles.line}>
                <Pressable
                  disabled={!l.productSlug}
                  onPress={() => l.productSlug && router.push({ pathname: "/product/[slug]", params: { slug: l.productSlug } })}
                  accessibilityRole="link"
                  accessibilityLabel={`${l.productName}, ${l.variantLabel}`}
                >
                  <ProductImage uri={l.imageUrl} alt={l.productName} style={styles.thumb} />
                </Pressable>
                <View style={{ flex: 1 }}>
                  <View style={styles.lineTop}>
                    <Text style={styles.name} numberOfLines={1}>
                      {l.productName}
                    </Text>
                    <Pressable
                      onPress={() => cart.remove(l.variantId)}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove ${l.productName} ${l.variantLabel}`}
                      hitSlop={8}
                      style={styles.remove}
                    >
                      <X size={17} color={colors.muted} />
                    </Pressable>
                  </View>
                  <Text style={type.small}>
                    {/* Today's price from the server quote (the one charged); the price seen when added only until it loads. */}
                    {l.variantLabel} · {formatINR(quote?.lines.find((x) => x.variantId === l.variantId)?.unitPrice ?? l.priceHint)} each
                  </Text>
                  <View style={styles.lineBottom}>
                    <QuantityStepper
                      size="sm"
                      value={l.quantity}
                      // Stock left for this pack (from the server quote), like the website's "+" button.
                      max={Math.max(l.quantity, quote?.lines.find((x) => x.variantId === l.variantId)?.maxQuantity ?? MAX_QTY_PER_LINE)}
                      onChange={(v) => cart.setQuantity(l.variantId, v)}
                      itemName={l.productName}
                      allowRemove
                    />
                    {total !== undefined ? (
                      <Text style={styles.lineTotal}>{formatINR(total)}</Text>
                    ) : quoteLoading ? (
                      <Skeleton width={54} height={16} />
                    ) : (
                      <Text style={[styles.lineTotal, { color: colors.muted }]}>{formatINR(l.priceHint * l.quantity)}</Text>
                    )}
                  </View>
                  {msg ? (
                    <View style={{ marginTop: 8 }}>
                      <InlineMessage tone="danger">{msg}</InlineMessage>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>

        {/* Coupon */}
        <Card>
          {cart.couponCode ? (
            <View style={styles.couponApplied}>
              <Ticket size={18} color={couponMessage ? colors.danger : colors.leaf600} />
              <View style={{ flex: 1 }}>
                <Text style={styles.couponCode}>{cart.couponCode}</Text>
                <Text style={[type.small, couponMessage ? { color: colors.danger } : { color: colors.leaf600 }]}>
                  {couponMessage
                    ? couponMessage
                    : quote && quote.couponCode
                      ? `Applied · you save ${formatINR(quote.discount)}`
                      : "Checking…"}
                </Text>
              </View>
              <Button label="Remove" variant="ghost" size="sm" onPress={() => cart.setCoupon(null)} accessibilityLabel={`Remove coupon ${cart.couponCode}`} />
            </View>
          ) : (
            <View style={styles.couponRow}>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="Coupon code"
                placeholderTextColor="#98a093"
                autoCapitalize="characters"
                autoCorrect={false}
                onSubmitEditing={applyCoupon}
                returnKeyType="done"
                accessibilityLabel="Coupon code"
                style={styles.couponInput}
                maxLength={32}
              />
              <Button label="Apply" variant="outline" size="sm" onPress={applyCoupon} disabled={!code.trim()} />
            </View>
          )}
        </Card>

        {/* Summary */}
        <Card title="Order summary">
          {quoteError ? (
            <View style={{ gap: 10 }}>
              <InlineMessage tone="danger">{quoteError}</InlineMessage>
              <Button label="Retry" variant="outline" size="sm" onPress={cart.refreshQuote} />
            </View>
          ) : !quote ? (
            <View style={{ gap: 10 }}>
              <Skeleton height={14} />
              <Skeleton height={14} width="70%" />
              <Skeleton height={20} width="50%" />
            </View>
          ) : (
            <View style={{ opacity: quoteLoading ? 0.55 : 1 }}>
              <PriceRow label="Subtotal" value={quote.subtotal} />
              {quote.discount > 0 ? <PriceRow label={`Discount (${quote.couponCode})`} value={quote.discount} tone="discount" /> : null}
              <PriceRow
                label="Delivery"
                value={quote.deliveryFee}
                valueText={!cart.location ? "Set PIN code" : quote.deliveryFee === 0 ? "Free" : undefined}
                tone={cart.location && quote.deliveryFee === 0 ? "free" : undefined}
              />
              {q?.area?.freeAbove && quote.deliveryFee > 0 ? (
                <Text style={[type.small, { marginTop: 2 }]}>
                  Free delivery on orders above {formatINR(q.area.freeAbove)}.
                </Text>
              ) : null}
              <PriceRow label="Total" value={quote.total} emphasis />
            </View>
          )}
          {shortBy > 0 ? <InlineMessage tone="warning">{`Minimum order is ${formatINR(q!.minOrder!)}. Add ${formatINR(shortBy)} more.`}</InlineMessage> : null}
          {cartLevelMessages.map(([k, m]) => (
            <View key={k} style={{ marginTop: 10 }}>
              <InlineMessage tone="warning">{m}</InlineMessage>
            </View>
          ))}
        </Card>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {quote && !quote.ok && !quoteLoading ? (
          <Text style={styles.footerHint} accessibilityLiveRegion="polite">
            Please fix the items marked above to continue.
          </Text>
        ) : null}
        <Button
          label={quote ? `Checkout · ${formatINR(quote.total)}` : "Checkout"}
          variant="dark"
          size="lg"
          fullWidth
          disabled={!canCheckout}
          loading={quoteLoading && !quote}
          onPress={() => router.push("/checkout")}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ivory },
  line: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
  },
  thumb: { width: 76, height: 76, borderRadius: radius.md },
  lineTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  name: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, flex: 1, marginTop: 2 },
  remove: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginTop: -6, marginRight: -6 },
  lineBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  lineTotal: { fontFamily: fonts.bold, fontSize: 15, color: colors.forest900 },
  couponRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  couponInput: {
    flex: 1,
    minWidth: 0, // let the field shrink on narrow phones so "Apply" stays on screen
    minHeight: HIT,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 16,
    fontFamily: fonts.semibold,
    fontSize: 14,
    letterSpacing: 1,
    color: colors.ink,
    backgroundColor: colors.sage50,
  },
  couponApplied: { flexDirection: "row", alignItems: "center", gap: 10 },
  couponCode: { fontFamily: fonts.bold, fontSize: 14, letterSpacing: 1, color: colors.ink },
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
  footerHint: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger, textAlign: "center", marginBottom: 8 },
});

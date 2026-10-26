import { useFocusEffect, useRouter } from "expo-router";
import { formatSlotLabel } from "@shared/slots";
import { ChevronRight, ReceiptText, RotateCcw } from "lucide-react-native";
import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatINR } from "@shared/money";
import { ORDER_STATUS_LABEL } from "@shared/orderStatus";
import type { Order } from "@shared/types";
import { Button } from "@/components/Button";
import { StatusPill } from "@/components/Chip";
import { ProductImage } from "@/components/ProductImage";
import { SignInPrompt } from "@/components/SignInPrompt";
import { ListSkeleton } from "@/components/Skeleton";
import { EmptyState, ErrorState, InlineMessage } from "@/components/States";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { formatDateLabel, formatDateTime, statusTone } from "@/lib/format";
import { reorder } from "@/lib/orders";
import { useFetch } from "@/lib/useFetch";
import { colors, fonts, radius, type } from "@/theme";

export default function Orders() {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const router = useRouter();
  const cart = useCart();
  const orders = useFetch<{ orders: Order[] }>(auth.signedIn ? "/api/orders" : null, [auth.profile?.id]);
  const [reordering, setReordering] = useState<string | null>(null);
  const [reorderMsg, setReorderMsg] = useState<string | null>(null);

  // Refresh when the tab regains focus (e.g. after placing an order).
  useFocusEffect(
    useCallback(() => {
      if (auth.signedIn) void orders.refresh();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [auth.signedIn]),
  );

  const doReorder = async (o: Order) => {
    setReordering(o.id);
    setReorderMsg(null);
    try {
      const res = await reorder(o.id, cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })));
      for (const it of res.items) {
        if (it.quantity <= 0) continue; // already in the basket in full
        const src = o.items.find((x) => x.variantId === it.variantId);
        cart.add(
          {
            variantId: it.variantId,
            productName: src?.productName ?? "Item",
            productSlug: it.productSlug,
            variantLabel: src?.variantLabel ?? "",
            imageUrl: src?.imageUrl ?? null,
            priceHint: it.price, // today's price, not the old order's
          },
          it.quantity,
        );
      }
      if (res.items.length === 0) {
        setReorderMsg("None of the items from this order are available right now.");
        return;
      }
      router.push("/cart");
    } catch (e) {
      setReorderMsg(errorMessage(e));
    } finally {
      setReordering(null);
    }
  };

  const header = (
    <View style={{ paddingTop: insets.top + 12, paddingBottom: 12 }}>
      <Text style={type.h1} accessibilityRole="header">
        Your orders
      </Text>
      {reorderMsg ? (
        <View style={{ marginTop: 10 }}>
          <InlineMessage tone="warning">{reorderMsg}</InlineMessage>
        </View>
      ) : null}
    </View>
  );

  if (!auth.ready) return <View style={[styles.flex, { padding: 16 }]}>{header}<ListSkeleton /></View>;
  if (!auth.signedIn) {
    return (
      <View style={[styles.flex, { paddingHorizontal: 16 }]}>
        {header}
        <SignInPrompt title="Sign in to see your orders" message="Track deliveries and reorder your favourites in one tap." next="/orders" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 }}
      data={orders.data?.orders ?? []}
      keyExtractor={(o) => o.id}
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      refreshControl={
        <RefreshControl refreshing={orders.refreshing} onRefresh={orders.refresh} tintColor={colors.leaf600} colors={[colors.leaf600]} />
      }
      ListEmptyComponent={
        orders.error ? (
          <ErrorState message={orders.error} onRetry={orders.reload} />
        ) : orders.loading ? (
          <ListSkeleton />
        ) : (
          <EmptyState
            icon={<ReceiptText size={30} color={colors.leaf600} />}
            title="No orders yet"
            message="When you place an order, it will show up here."
            actionLabel="Start shopping"
            onAction={() => router.push("/categories")}
          />
        )
      }
      renderItem={({ item: o }) => (
        <View style={styles.card}>
          <Pressable
            onPress={() => router.push({ pathname: "/orders/[id]", params: { id: o.id } })}
            accessibilityRole="button"
            accessibilityLabel={`Order ${o.orderNumber}, ${ORDER_STATUS_LABEL[o.status]}, ${formatINR(o.total)}`}
            style={({ pressed }) => pressed && { opacity: 0.8 }}
          >
            <View style={styles.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.number}>#{o.orderNumber}</Text>
                <Text style={type.small}>Placed {formatDateTime(o.createdAt)}</Text>
              </View>
              <StatusPill label={ORDER_STATUS_LABEL[o.status]} tone={statusTone(o.status)} />
            </View>
            <View style={styles.thumbs}>
              {o.items.slice(0, 4).map((it, i) => (
                <ProductImage key={`${it.variantId}-${i}`} uri={it.imageUrl} style={styles.thumb} />
              ))}
              {o.items.length > 4 ? (
                <View style={[styles.thumb, styles.more]}>
                  <Text style={styles.moreText}>+{o.items.length - 4}</Text>
                </View>
              ) : null}
              <View style={{ flex: 1 }} />
              <ChevronRight size={20} color={colors.muted} />
            </View>
            <Text style={[type.small, { marginTop: 10 }]}>
              {o.items.length} item{o.items.length === 1 ? "" : "s"} · Delivery {formatDateLabel(o.deliveryDate)}, {formatSlotLabel(o.slotLabel)}
            </Text>
          </Pressable>
          <View style={styles.cardBottom}>
            <Text style={styles.total}>{formatINR(o.total)}</Text>
            <Button
              label="Reorder"
              variant="lime"
              size="sm"
              loading={reordering === o.id}
              onPress={() => doReorder(o)}
              icon={<RotateCcw size={15} color={colors.forest900} />}
              accessibilityLabel={`Reorder items from order ${o.orderNumber}`}
            />
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ivory },
  card: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 14 },
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  number: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  thumbs: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  more: { backgroundColor: colors.sage100, alignItems: "center", justifyContent: "center" },
  moreText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.inkSoft },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  total: { fontFamily: fonts.bold, fontSize: 16, color: colors.forest900 },
});

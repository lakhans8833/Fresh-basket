import { useLocalSearchParams, useRouter } from "expo-router";
import { Check, CircleX, Clock } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatINR } from "@shared/money";
import { canCustomerCancel, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, TRACKING_STEPS } from "@shared/orderStatus";
import type { Order } from "@shared/types";
import { AddressSummary } from "@/components/AddressSummary";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { StatusPill } from "@/components/Chip";
import { PriceRow } from "@/components/PriceRow";
import { ProductImage } from "@/components/ProductImage";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SignInPrompt } from "@/components/SignInPrompt";
import { ListSkeleton } from "@/components/Skeleton";
import { ErrorState, InlineMessage } from "@/components/States";
import { errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDateLabel, formatDateTime, statusTone } from "@/lib/format";
import { cancelOrder, fetchOrder, resumePayment } from "@/lib/orders";
import { openPayPage } from "@/lib/payment";
import { colors, fonts, radius, type } from "@/theme";

const POLL_MS = 4000;
const METHOD_LABEL = { cod: "Cash on delivery", razorpay: "Online payment", mock: "Test payment (development)" } as const;

export default function OrderDetail() {
  const { id, placed } = useLocalSearchParams<{ id: string; placed?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<"pay" | "cancel" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const appActive = useRef(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetchOrder(id);
      setOrder(res.order);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    if (auth.signedIn) void load();
  }, [load, auth.signedIn]);

  // Poll while awaiting payment confirmation (the server verifies the payment, not the app).
  const pending = order?.status === "pending_payment";
  useEffect(() => {
    if (!pending) return;
    const sub = AppState.addEventListener("change", (s) => {
      appActive.current = s === "active";
      if (s === "active") void load();
    });
    const t = setInterval(() => {
      if (appActive.current) void load();
    }, POLL_MS);
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [pending, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const pay = async () => {
    if (!order) return;
    setBusy("pay");
    setActionError(null);
    try {
      const res = await resumePayment(order.id);
      setOrder(res.order);
      if (res.payment?.payUrl) await openPayPage(res.payment.payUrl);
      await load();
    } catch (e) {
      setActionError(errorMessage(e));
      void load();
    } finally {
      setBusy(null);
    }
  };

  const doCancel = async () => {
    if (!order) return;
    setBusy("cancel");
    setActionError(null);
    try {
      const res = await cancelOrder(order.id);
      setOrder(res.order);
    } catch (e) {
      setActionError(errorMessage(e));
      void load();
    } finally {
      setBusy(null);
    }
  };

  const confirmCancel = () => {
    const msg = "Are you sure you want to cancel this order?";
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(msg)) void doCancel();
      return;
    }
    Alert.alert("Cancel order", msg, [
      { text: "Keep order", style: "cancel" },
      { text: "Cancel order", style: "destructive", onPress: () => void doCancel() },
    ]);
  };

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/orders"));

  if (auth.ready && !auth.signedIn) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Order" onBack={goBack} />
        <SignInPrompt title="Sign in to view this order" message="Your order details are only visible to you." next={`/orders/${id}`} />
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Order" onBack={goBack} />
        {error ? <ErrorState message={error} onRetry={load} /> : <View style={{ padding: 16 }}><ListSkeleton rows={3} /></View>}
      </View>
    );
  }

  const cancelled = order.status === "cancelled";
  const stepIndex = TRACKING_STEPS.indexOf(order.status);
  const eventTime = (s: string) => order.events.find((e) => e.status === s)?.createdAt;
  const cancelEvent = order.events.find((e) => e.status === "cancelled");

  return (
    <View style={styles.flex}>
      <ScreenHeader title={`#${order.orderNumber}`} onBack={goBack} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.leaf600} colors={[colors.leaf600]} />}
      >
        {placed === "1" && order.status === "placed" ? (
          <InlineMessage tone="success">Thank you! Your order has been placed.</InlineMessage>
        ) : null}

        <Card>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={type.small}>Placed {formatDateTime(order.createdAt)}</Text>
              <Text style={[type.h2, { marginTop: 4 }]}>{ORDER_STATUS_LABEL[order.status]}</Text>
            </View>
            <StatusPill label={PAYMENT_STATUS_LABEL[order.paymentStatus]} tone={order.paymentStatus === "paid" || order.paymentStatus === "cod_collected" ? "success" : order.paymentStatus === "failed" ? "danger" : "neutral"} />
          </View>

          {pending ? (
            <View style={{ marginTop: 14, gap: 10 }}>
              <InlineMessage tone="warning">
                We're waiting for your payment to be confirmed. This page updates automatically.
                {order.reservationExpiresAt ? ` Items are held until ${formatDateTime(order.reservationExpiresAt)}.` : ""}
              </InlineMessage>
              <Button label="Complete payment" variant="dark" fullWidth loading={busy === "pay"} onPress={pay} />
            </View>
          ) : null}

          {/* Timeline */}
          {cancelled ? (
            <View style={[styles.cancelBox]}>
              <CircleX size={22} color={colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.stepTitle, { color: colors.danger }]}>Order cancelled</Text>
                {cancelEvent ? <Text style={type.small}>{formatDateTime(cancelEvent.createdAt)}{cancelEvent.note ? ` · ${cancelEvent.note}` : ""}</Text> : null}
              </View>
            </View>
          ) : (
            <View style={{ marginTop: 18 }} accessibilityRole="list" accessibilityLabel="Delivery progress">
              {TRACKING_STEPS.map((s, i) => {
                const done = stepIndex >= i;
                const current = stepIndex === i;
                const at = eventTime(s);
                const last = i === TRACKING_STEPS.length - 1;
                return (
                  <View key={s} style={styles.step} accessible accessibilityLabel={`${ORDER_STATUS_LABEL[s]}${done ? ", done" : ", pending"}`}>
                    <View style={styles.stepRail}>
                      <View style={[styles.stepDot, done && styles.stepDotDone, current && styles.stepDotCurrent]}>
                        {done ? <Check size={13} color={colors.white} strokeWidth={3} /> : null}
                      </View>
                      {!last ? <View style={[styles.stepLine, stepIndex > i && styles.stepLineDone]} /> : null}
                    </View>
                    <View style={{ flex: 1, paddingBottom: last ? 0 : 18 }}>
                      <Text style={[styles.stepTitle, !done && { color: colors.muted }]}>{ORDER_STATUS_LABEL[s]}</Text>
                      {at ? <Text style={type.small}>{formatDateTime(at)}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        <Card title="Delivery">
          <View style={[styles.rowBetween, { marginBottom: 10, justifyContent: "flex-start", gap: 8 }]}>
            <Clock size={16} color={colors.leaf600} />
            <Text style={styles.slot}>
              {formatDateLabel(order.deliveryDate)} · {order.slotLabel}
            </Text>
          </View>
          <AddressSummary address={order.address} />
          {order.customerNote ? <Text style={[type.small, { marginTop: 8 }]}>Note: {order.customerNote}</Text> : null}
        </Card>

        <Card title={`Items (${order.items.length})`}>
          {order.items.map((it, i) => (
            <View key={`${it.variantId}-${i}`} style={styles.item}>
              <ProductImage uri={it.imageUrl} style={styles.thumb} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{it.productName}</Text>
                <Text style={type.small}>
                  {it.variantLabel} · {it.quantity} × {formatINR(it.unitPrice)}
                </Text>
              </View>
              <Text style={styles.itemTotal}>{formatINR(it.lineTotal)}</Text>
            </View>
          ))}
          <View style={{ marginTop: 8 }}>
            <PriceRow label="Subtotal" value={order.subtotal} />
            {order.discount > 0 ? <PriceRow label={`Discount${order.couponCode ? ` (${order.couponCode})` : ""}`} value={order.discount} tone="discount" /> : null}
            <PriceRow label="Delivery" value={order.deliveryFee} valueText={order.deliveryFee === 0 ? "Free" : undefined} tone={order.deliveryFee === 0 ? "free" : undefined} />
            <PriceRow label="Total" value={order.total} emphasis />
            <Text style={[type.small, { marginTop: 6 }]}>Paid via {METHOD_LABEL[order.paymentMethod]}</Text>
          </View>
        </Card>

        {actionError ? <InlineMessage tone="danger">{actionError}</InlineMessage> : null}

        {canCustomerCancel(order.status) ? (
          <Button label="Cancel order" variant="danger" fullWidth loading={busy === "cancel"} onPress={confirmCancel} />
        ) : null}
        <Button label="Continue shopping" variant="ghost" fullWidth onPress={() => router.replace("/")} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ivory },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  step: { flexDirection: "row", gap: 12 },
  stepRail: { alignItems: "center", width: 24 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotDone: { backgroundColor: colors.leaf600, borderColor: colors.leaf600 },
  stepDotCurrent: { borderColor: colors.lime300, borderWidth: 3 },
  stepLine: { flex: 1, width: 2, backgroundColor: colors.line, marginVertical: 2 },
  stepLineDone: { backgroundColor: colors.leaf600 },
  stepTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink, marginTop: 1 },
  cancelBox: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: 12,
  },
  slot: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  thumb: { width: 48, height: 48, borderRadius: 10 },
  itemName: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  itemTotal: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
});

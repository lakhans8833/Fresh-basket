import { Redirect, useRouter } from "expo-router";
import { Banknote, Check, CreditCard, FlaskConical, Plus } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatINR } from "@shared/money";
import type { PaymentMethod } from "@shared/orderStatus";
import { formatSlotTime } from "@shared/slots";
import type { Address, PlaceOrderResponse, QuoteResponse, SlotOption } from "@shared/types";
import {
  AddressForm,
  emptyAddress,
  validateAddress,
  type AddressErrors,
  type AddressFormValues,
} from "@/components/AddressForm";
import { AddressSummary } from "@/components/AddressSummary";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { PriceRow } from "@/components/PriceRow";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ListSkeleton, Skeleton } from "@/components/Skeleton";
import { EmptyState, ErrorState, InlineMessage } from "@/components/States";
import { TextField } from "@/components/TextField";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { formatDateLabel } from "@/lib/format";
import { randomId } from "@/lib/id";
import { rejectionMessages } from "@/lib/orders";
import { openPayPage } from "@/lib/payment";
import { useSettings } from "@/lib/settings";
import { useFetch } from "@/lib/useFetch";
import { colors, fonts, HIT, radius, type } from "@/theme";

const PAYMENT_LABEL: Record<PaymentMethod, { title: string; sub: string }> = {
  razorpay: { title: "Pay online (UPI, cards, net banking)", sub: "Secure checkout opens in a browser window" },
  mock: { title: "Test payment — development only, no real money", sub: "Simulates an online payment" },
  cod: { title: "Cash on delivery", sub: "Pay when your order arrives" },
  // WhatsApp-order methods (not offered at the app checkout; listed so every method has a label).
  upi: { title: "UPI", sub: "Pay to the store's UPI ID" },
  razorpay_link: { title: "Payment link", sub: "Secure Razorpay payment link" },
};

export default function Checkout() {
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const { paymentMethods, settings, error: settingsError, reload: reloadSettings } = useSettings();

  const addresses = useFetch<{ addresses: Address[] }>(auth.signedIn ? "/api/me/addresses" : null, [auth.signedIn]);
  const slots = useFetch<{ slots: SlotOption[] }>("/api/delivery/slots");

  const [addressId, setAddressId] = useState<string | null>(null);
  const [useNew, setUseNew] = useState(false);
  const [form, setForm] = useState<AddressFormValues>(() =>
    emptyAddress({ fullName: auth.profile?.fullName ?? "", phone: auth.profile?.phone ?? "", pincode: cart.location?.pincode ?? "", city: cart.location?.city ?? "" }),
  );
  const [formErrors, setFormErrors] = useState<AddressErrors>({});
  const [saveAddress, setSaveAddress] = useState(true);
  const [date, setDate] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod | null>(null);
  const [note, setNote] = useState("");
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [rejections, setRejections] = useState<string[]>([]);

  // Prefill the new-address form once the profile is known (it may load after mount).
  useEffect(() => {
    const p = auth.profile;
    if (!p) return;
    setForm((f) => ({ ...f, fullName: f.fullName || p.fullName || "", phone: f.phone || p.phone || "" }));
  }, [auth.profile]);

  // Default selections
  useEffect(() => {
    const list = addresses.data?.addresses;
    if (!list) return;
    if (list.length === 0) setUseNew(true);
    else if (!addressId || !list.some((a) => a.id === addressId)) {
      setAddressId((list.find((a) => a.isDefault) ?? list[0])!.id);
    }
  }, [addresses.data, addressId]);

  const dates = useMemo(() => {
    const out: { date: string; slots: SlotOption[] }[] = [];
    for (const s of slots.data?.slots ?? []) {
      let d = out.find((x) => x.date === s.date);
      if (!d) out.push((d = { date: s.date, slots: [] }));
      d.slots.push(s);
    }
    return out;
  }, [slots.data]);

  useEffect(() => {
    if (dates.length === 0) return;
    if (!date || !dates.some((d) => d.date === date)) {
      const first = dates.find((d) => d.slots.some((s) => s.available)) ?? dates[0]!;
      setDate(first.date);
      setSlotId(first.slots.find((s) => s.available)?.slotId ?? null);
    }
  }, [dates, date]);

  useEffect(() => {
    if (!payment && paymentMethods.length > 0) setPayment(paymentMethods.includes("cod") && paymentMethods.length === 1 ? "cod" : paymentMethods[0]!);
    if (payment && paymentMethods.length > 0 && !paymentMethods.includes(payment)) setPayment(paymentMethods[0]!);
  }, [paymentMethods, payment]);

  const selectedAddress = addresses.data?.addresses.find((a) => a.id === addressId) ?? null;
  const pincode = useNew ? (/^\d{6}$/.test(form.pincode) ? form.pincode : null) : selectedAddress?.pincode ?? null;

  // Server quote for the delivery PIN code of the chosen address.
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);
  useEffect(() => {
    if (cart.lines.length === 0) return;
    let cancelled = false;
    setQuoteLoading(true);
    api<QuoteResponse>("/api/quote", {
      method: "POST",
      body: { items: cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })), couponCode: cart.couponCode, pincode },
    })
      .then((r) => {
        if (!cancelled) {
          setQuote(r);
          setQuoteError(null);
        }
      })
      .catch((e) => !cancelled && setQuoteError(errorMessage(e)))
      .finally(() => !cancelled && setQuoteLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.signature, pincode, quoteNonce]);

  // Idempotency key: stable while the order request stays the same, regenerated when it changes.
  const payloadSignature = JSON.stringify([cart.signature, useNew ? form : addressId, date, slotId, payment, note.trim()]);
  const idem = useRef<{ sig: string; key: string }>({ sig: "", key: randomId() });
  if (idem.current.sig !== payloadSignature) idem.current = { sig: payloadSignature, key: randomId() };

  if (!auth.ready) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Checkout" />
        <View style={{ padding: 16 }}>
          <ListSkeleton rows={3} />
        </View>
      </View>
    );
  }
  if (!auth.signedIn) return <Redirect href={{ pathname: "/login", params: { next: "/checkout" } }} />;

  if (cart.hydrated && cart.lines.length === 0) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Checkout" />
        <EmptyState title="Your basket is empty" message="Add some vegetables before checking out." actionLabel="Shop fresh" onAction={() => router.replace("/categories")} />
      </View>
    );
  }

  const nameOf = (variantId: string) => {
    const l = cart.lines.find((x) => x.variantId === variantId);
    return l ? `${l.productName} (${l.variantLabel})` : undefined;
  };
  const q = quote?.quote;
  const slotsForDate = dates.find((d) => d.date === date)?.slots ?? [];
  const blocking: string[] = [];
  if (!payment) blocking.push("Choose a payment method");
  if (!slotId || !date) blocking.push("Choose a delivery slot");
  if (!useNew && !selectedAddress) blocking.push("Choose a delivery address");
  if (q && !q.ok) {
    blocking.push(
      q.issues.some((i) => i.code === "AREA_NOT_SERVICEABLE")
        ? "We don't deliver to this PIN code yet"
        : q.issues.some((i) => i.code === "BELOW_MIN_ORDER")
          ? "Your order is below the minimum order value"
          : "Some items in your basket need attention",
    );
  }

  const place = async () => {
    setPlaceError(null);
    setRejections([]);
    let addressPayload: Record<string, unknown>;
    if (useNew) {
      const v = validateAddress(form);
      if (!v.ok) {
        setFormErrors(v.errors);
        setPlaceError("Please check the delivery address.");
        return;
      }
      setFormErrors({});
      addressPayload = { address: v.value, saveAddress };
    } else {
      if (!selectedAddress) return;
      addressPayload = { addressId: selectedAddress.id };
    }
    if (!slotId || !date || !payment) return;

    setPlacing(true);
    try {
      const res = await api<PlaceOrderResponse>("/api/orders", {
        method: "POST",
        body: {
          items: cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          couponCode: cart.couponCode,
          ...addressPayload,
          slotId,
          deliveryDate: date,
          paymentMethod: payment,
          customerNote: note.trim() || null,
          idempotencyKey: idem.current.key,
        },
      });
      cart.clear();
      const orderId = res.order.id;
      router.replace({ pathname: "/orders/[id]", params: { id: orderId, placed: "1" } });
      if (res.payment?.payUrl && res.order.status === "pending_payment") {
        await openPayPage(res.payment.payUrl);
      }
    } catch (e) {
      // The basket is kept on every error. A new idempotency key only when the server definitely didn't
      // keep this attempt (ORDER_CANCELLED or a 4xx rejection); offline / 5xx keep it so a retry can't
      // create a second order.
      if (e instanceof ApiError && (e.code === "ORDER_CANCELLED" || (e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429))) {
        idem.current = { sig: payloadSignature, key: randomId() };
      }
      if (e instanceof ApiError && e.code === "ORDER_CANCELLED") {
        setRejections([]);
        setPlaceError(e.message || "That order was cancelled. Your basket is unchanged — please place the order again.");
      } else if (e instanceof ApiError && e.status === 409) {
        const lines = rejectionMessages(e.details, nameOf);
        setRejections(lines);
        setPlaceError(e.message || "We couldn't place your order.");
        cart.refreshQuote();
        setQuoteNonce((n) => n + 1);
        slots.refresh();
      } else if (e instanceof ApiError && e.status === 401) {
        router.push({ pathname: "/login", params: { next: "/checkout" } });
      } else {
        setPlaceError(errorMessage(e));
      }
    } finally {
      setPlacing(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenHeader title="Checkout" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 + insets.bottom, gap: 14 }} keyboardShouldPersistTaps="handled">
        {/* Address */}
        <Card title="Delivery address">
          {addresses.error ? (
            <ErrorState compact message={addresses.error} onRetry={addresses.reload} />
          ) : addresses.loading && !addresses.data ? (
            <ListSkeleton rows={2} />
          ) : (
            <View style={{ gap: 10 }}>
              {(addresses.data?.addresses ?? []).map((a) => {
                const selected = !useNew && a.id === addressId;
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => {
                      setUseNew(false);
                      setAddressId(a.id);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, selected }}
                    aria-checked={selected}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <Radio on={selected} />
                    <View style={{ flex: 1 }}>
                      <AddressSummary address={a} />
                    </View>
                  </Pressable>
                );
              })}
              {(addresses.data?.addresses.length ?? 0) > 0 ? (
                <Pressable
                  onPress={() => setUseNew(true)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: useNew, selected: useNew }}
                  aria-checked={useNew}
                  style={[styles.option, useNew && styles.optionSelected, { alignItems: "center" }]}
                >
                  <Radio on={useNew} />
                  <Plus size={16} color={colors.forest900} />
                  <Text style={styles.optionTitle}>Deliver to a new address</Text>
                </Pressable>
              ) : null}
              {useNew ? (
                <View style={{ marginTop: 6 }}>
                  <AddressForm values={form} onChange={setForm} errors={formErrors} showDefaultToggle={false} />
                  <Pressable
                    onPress={() => setSaveAddress((s) => !s)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: saveAddress }}
                    style={styles.checkRow}
                  >
                    <View style={[styles.checkbox, saveAddress && styles.checkboxOn]}>{saveAddress ? <Check size={14} color={colors.white} /> : null}</View>
                    <Text style={styles.optionTitle}>Save this address for next time</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
          {quote && pincode && !quote.area ? (
            <View style={{ marginTop: 10 }}>
              <InlineMessage tone="danger">We don't deliver to PIN code {pincode} yet.</InlineMessage>
            </View>
          ) : null}
        </Card>

        {/* Slot */}
        <Card title="Delivery slot">
          {slots.error ? (
            <ErrorState compact message={slots.error} onRetry={slots.reload} />
          ) : slots.loading && !slots.data ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Skeleton width={100} height={44} r={22} />
              <Skeleton width={100} height={44} r={22} />
            </View>
          ) : dates.length === 0 ? (
            <InlineMessage tone="warning">No delivery slots are open right now. Please check back later.</InlineMessage>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {dates.map((d) => {
                  const any = d.slots.some((s) => s.available);
                  return (
                    <Chip
                      key={d.date}
                      label={formatDateLabel(d.date)}
                      sublabel={any ? undefined : "Full"}
                      selected={date === d.date}
                      disabled={!any}
                      onPress={() => {
                        setDate(d.date);
                        setSlotId(d.slots.find((s) => s.available)?.slotId ?? null);
                      }}
                    />
                  );
                })}
              </ScrollView>
              <View style={{ gap: 8, marginTop: 12 }} accessibilityRole="radiogroup">
                {slotsForDate.map((s) => {
                  const selected = s.slotId === slotId;
                  return (
                    <Pressable
                      key={s.slotId}
                      disabled={!s.available}
                      onPress={() => setSlotId(s.slotId)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected, selected, disabled: !s.available }}
                      aria-checked={selected}
                      aria-disabled={!s.available}
                      accessibilityLabel={`${s.label}, ${formatSlotTime(s.startTime)} to ${formatSlotTime(s.endTime)}${s.available ? "" : ", unavailable"}`}
                      style={[styles.option, selected && styles.optionSelected, !s.available && styles.optionDisabled]}
                    >
                      <Radio on={selected} disabled={!s.available} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optionTitle, !s.available && { color: colors.muted }]}>{s.label}</Text>
                        <Text style={type.small}>
                          {formatSlotTime(s.startTime)} – {formatSlotTime(s.endTime)}
                          {s.available ? "" : " · Unavailable"}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </Card>

        {/* Payment */}
        <Card title="Payment">
          {settingsError && paymentMethods.length === 0 ? (
            <ErrorState compact message={settingsError} onRetry={reloadSettings} />
          ) : paymentMethods.length === 0 ? (
            <InlineMessage tone="warning">No payment methods are available right now.</InlineMessage>
          ) : (
            <View style={{ gap: 8 }} accessibilityRole="radiogroup">
              {paymentMethods.map((m) => {
                const selected = payment === m;
                const Icon = m === "cod" ? Banknote : m === "mock" ? FlaskConical : CreditCard;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setPayment(m)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, selected }}
                    aria-checked={selected}
                    accessibilityLabel={PAYMENT_LABEL[m].title}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <Radio on={selected} />
                    <Icon size={20} color={m === "mock" ? colors.amber : colors.forest800} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionTitle}>{PAYMENT_LABEL[m].title}</Text>
                      <Text style={type.small}>{PAYMENT_LABEL[m].sub}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Card>

        <Card title="Note for the delivery partner">
          <TextField
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={300}
            placeholder="e.g. Ring the bell twice"
          />
        </Card>

        {/* Summary */}
        <Card title="Summary">
          {cart.lines.map((l) => (
            <View key={l.variantId} style={styles.itemRow}>
              <Text style={styles.itemText} numberOfLines={1}>
                {l.quantity} × {l.productName} <Text style={{ color: colors.muted }}>({l.variantLabel})</Text>
              </Text>
              <Text style={styles.itemPrice}>
                {formatINR(q?.lines.find((x) => x.variantId === l.variantId)?.lineTotal ?? l.priceHint * l.quantity)}
              </Text>
            </View>
          ))}
          <View style={{ height: 8 }} />
          {quoteError ? (
            <View style={{ gap: 8 }}>
              <InlineMessage tone="danger">{quoteError}</InlineMessage>
              <Button label="Retry" size="sm" variant="outline" onPress={() => setQuoteNonce((n) => n + 1)} />
            </View>
          ) : q ? (
            <View style={{ opacity: quoteLoading ? 0.55 : 1 }}>
              <PriceRow label="Subtotal" value={q.subtotal} />
              {q.discount > 0 ? <PriceRow label={`Discount (${q.couponCode})`} value={q.discount} tone="discount" /> : null}
              <PriceRow
                label="Delivery"
                value={q.deliveryFee}
                valueText={!pincode ? "—" : q.deliveryFee === 0 ? "Free" : undefined}
                tone={pincode && q.deliveryFee === 0 ? "free" : undefined}
              />
              <PriceRow label="Total" value={q.total} emphasis />
              {Object.entries(quote?.messages ?? {}).map(([k, m]) => (
                <View key={k} style={{ marginTop: 8 }}>
                  <InlineMessage tone="warning">{k.startsWith("_") ? m : `${nameOf(k) ?? "Item"}: ${m}`}</InlineMessage>
                </View>
              ))}
            </View>
          ) : (
            <ListSkeleton rows={1} />
          )}
        </Card>

        {placeError ? (
          <View style={{ gap: 6 }} accessibilityLiveRegion="assertive">
            <InlineMessage tone="danger">{placeError}</InlineMessage>
            {rejections.map((r) => (
              <InlineMessage key={r} tone="danger">
                {r}
              </InlineMessage>
            ))}
            {rejections.length > 0 ? (
              <Button label="Review basket" variant="outline" size="sm" onPress={() => router.replace("/cart")} />
            ) : null}
          </View>
        ) : null}
        {settings && settings.defaultMinOrder > 0 ? (
          <Text style={[type.small, { textAlign: "center" }]}>Minimum order {formatINR(settings.defaultMinOrder)}.</Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {blocking.length > 0 && !quoteLoading ? <Text style={styles.footerHint}>{blocking[0]}</Text> : null}
        <Button
          label={payment === "cod" ? `Place order${q ? ` · ${formatINR(q.total)}` : ""}` : `Place order & pay${q ? ` · ${formatINR(q.total)}` : ""}`}
          variant="dark"
          size="lg"
          fullWidth
          loading={placing}
          disabled={blocking.length > 0 || !q || quoteLoading}
          onPress={place}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function Radio({ on, disabled }: { on: boolean; disabled?: boolean }) {
  return (
    <View style={[styles.radio, on && styles.radioOn, disabled && { opacity: 0.4 }]}>
      {on ? <View style={styles.radioDot} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.ivory },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 12,
    minHeight: HIT,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  optionSelected: { borderColor: colors.leaf600, backgroundColor: colors.lime100 },
  optionDisabled: { backgroundColor: colors.sage50, borderStyle: "dashed" },
  optionTitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.muted,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  radioOn: { borderColor: colors.leaf600 },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.leaf600 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: HIT },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.muted, alignItems: "center", justifyContent: "center" },
  checkboxOn: { backgroundColor: colors.leaf600, borderColor: colors.leaf600 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 3 },
  itemText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.inkSoft },
  itemPrice: { fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
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
  footerHint: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted, textAlign: "center", marginBottom: 8 },
});

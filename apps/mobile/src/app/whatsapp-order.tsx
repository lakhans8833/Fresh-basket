import { useRouter } from "expo-router";
import { Banknote, Check, CreditCard, MessageCircle } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatINR } from "@shared/money";
import type { PaymentMethod } from "@shared/orderStatus";
import { formatSlotTime } from "@shared/slots";
import type { SlotOption } from "@shared/types";
import { normalizeWhatsAppNumber, whatsappCustomerSchema } from "@shared/whatsapp";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { ScreenHeader } from "@/components/ScreenHeader";
import { EmptyState, ErrorState, InlineMessage } from "@/components/States";
import { TextField } from "@/components/TextField";
import { ApiError, api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { formatDateLabel } from "@/lib/format";
import { randomId } from "@/lib/id";
import { rejectionMessages } from "@/lib/orders";
import { useSettings } from "@/lib/settings";
import { useFetch } from "@/lib/useFetch";
import { colors, fonts, HIT, radius, type } from "@/theme";

/**
 * Order on WhatsApp (same as the website's /order page): the customer fills in name, mobile and address,
 * picks a slot and how to pay; the order is saved on the server (stock held, waiting for the store to
 * confirm), then WhatsApp opens with the order message for the store. Works signed in or as a guest.
 */
type Fields = { name: string; phone: string; address: string; area: string; city: string; pincode: string; notes: string };
type FieldErrors = Partial<Record<keyof Fields, string>>;

interface PlacedWaOrder {
  order: { id: string; orderNumber: string; total: number; paymentMethod: string };
  whatsappUrl: string;
  payLink: string | null;
}

const METHOD_LABEL: Partial<Record<PaymentMethod, { title: string; sub: string }>> = {
  cod: { title: "Cash on delivery", sub: "Pay when your order arrives" },
  razorpay_link: { title: "Payment link", sub: "We send a secure Razorpay link to pay online" },
};

export default function WhatsAppOrder() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const auth = useAuth();
  const { settings, whatsappPaymentMethods, error: settingsError, reload: reloadSettings } = useSettings();
  const slots = useFetch<{ slots: SlotOption[] }>("/api/delivery/slots");
  const storeNumber = normalizeWhatsAppNumber(settings?.whatsapp ?? null);

  const [f, setF] = useState<Fields>(() => ({
    name: auth.profile?.fullName ?? "",
    phone: auth.profile?.phone ?? "",
    address: "",
    area: cart.location?.areaName ?? "",
    city: cart.location?.city ?? "Faridabad",
    pincode: cart.location?.pincode ?? "",
    notes: "",
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [date, setDate] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [rejections, setRejections] = useState<string[]>([]);
  const [placed, setPlaced] = useState<PlacedWaOrder | null>(null);
  const [opened, setOpened] = useState(true);

  const set = (k: keyof Fields) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (!method && whatsappPaymentMethods.length > 0) setMethod(whatsappPaymentMethods[0]!);
  }, [whatsappPaymentMethods, method]);

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
    if (dates.length === 0 || (date && slotId)) return;
    const first = dates.find((d) => d.slots.some((s) => s.available));
    if (first) {
      setDate(first.date);
      setSlotId(first.slots.find((s) => s.available)!.slotId);
    }
  }, [dates, date, slotId]);
  const slotsForDate = dates.find((d) => d.date === date)?.slots ?? [];

  // Same request → same key, so a retry after a network error can't create a second order.
  const signature = JSON.stringify([cart.signature, f, date, slotId, method]);
  const idem = useRef<{ sig: string; key: string }>({ sig: "", key: randomId() });
  if (idem.current.sig !== signature) idem.current = { sig: signature, key: randomId() };

  const openWhatsApp = async (url: string) => {
    try {
      await Linking.openURL(url);
      setOpened(true);
    } catch {
      setOpened(false);
    }
  };

  const send = async () => {
    setPlaceError(null);
    setRejections([]);
    const parsed = whatsappCustomerSchema.safeParse(f);
    if (!parsed.success) {
      const errs: FieldErrors = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0] as keyof Fields;
        if (!errs[k]) errs[k] = i.message;
      }
      setErrors(errs);
      setPlaceError("Please check the details marked above.");
      return;
    }
    setErrors({});
    if (!date || !slotId) return setPlaceError("Choose a delivery date and time slot.");
    if (!method) return setPlaceError("Choose how you'll pay.");
    setPlacing(true);
    try {
      const r = await api<PlacedWaOrder>("/api/whatsapp-orders", {
        method: "POST",
        body: {
          items: cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          customer: parsed.data,
          paymentMethod: method,
          couponCode: auth.signedIn ? cart.couponCode : null,
          idempotencyKey: idem.current.key,
          deliveryDate: date,
          slotId,
        },
      });
      cart.clear();
      setPlaced(r);
      await openWhatsApp(r.whatsappUrl);
    } catch (e) {
      // The server definitely refused (4xx): the next try is a new order. Offline / 5xx keep the key.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429) {
        idem.current = { sig: signature, key: randomId() };
      }
      if (e instanceof ApiError && e.status === 409) {
        const nameOf = (variantId: string) => {
          const l = cart.lines.find((x) => x.variantId === variantId);
          return l ? `${l.productName} (${l.variantLabel})` : undefined;
        };
        setRejections(rejectionMessages(e.details, nameOf));
        setPlaceError(e.message || "We couldn't place your order.");
        slots.refresh();
      } else {
        setPlaceError(errorMessage(e));
      }
    } finally {
      setPlacing(false);
    }
  };

  if (placed) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Order on WhatsApp" />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
          <Card>
            <View style={{ alignItems: "center", gap: 8, paddingVertical: 8 }}>
              <View style={styles.doneIcon}>
                <Check size={28} color={colors.white} />
              </View>
              <Text style={styles.doneTitle}>Order {placed.order.orderNumber} saved</Text>
              <Text style={[type.body, { textAlign: "center" }]}>
                Total {formatINR(placed.order.total)}. Send the WhatsApp message so the store can confirm your order.
              </Text>
            </View>
          </Card>
          {!opened ? <InlineMessage tone="warning">WhatsApp didn't open. Is WhatsApp installed? Tap the button below to try again.</InlineMessage> : null}
          <Button label="Open WhatsApp" variant="primary" size="lg" fullWidth icon={<MessageCircle size={20} color={colors.white} />} onPress={() => void openWhatsApp(placed.whatsappUrl)} />
          {placed.payLink ? <Button label="Pay online now" variant="outline" fullWidth onPress={() => void Linking.openURL(placed.payLink!)} /> : null}
          <Button label="Continue shopping" variant="ghost" fullWidth onPress={() => router.replace("/")} />
        </ScrollView>
      </View>
    );
  }

  if (cart.hydrated && cart.lines.length === 0) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Order on WhatsApp" />
        <EmptyState title="Your basket is empty" message="Add some vegetables first." actionLabel="Shop fresh" onAction={() => router.replace("/categories")} />
      </View>
    );
  }

  if (settings && !storeNumber) {
    return (
      <View style={styles.flex}>
        <ScreenHeader title="Order on WhatsApp" />
        <View style={{ padding: 16, gap: 12 }}>
          <InlineMessage tone="warning">Ordering on WhatsApp isn't available right now. You can place the order with Checkout.</InlineMessage>
          <Button label="Go to checkout" variant="dark" fullWidth onPress={() => router.replace("/checkout")} />
        </View>
      </View>
    );
  }

  const estimate = cart.lines.reduce((sum, l) => sum + l.priceHint * l.quantity, 0);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScreenHeader title="Order on WhatsApp" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 + insets.bottom, gap: 14 }} keyboardShouldPersistTaps="handled">
        <InlineMessage tone="info">We save your order, then WhatsApp opens with the details. The store confirms it there.</InlineMessage>

        <Card title="Your details">
          <View style={{ gap: 10 }}>
            <TextField label="Full name" value={f.name} onChangeText={set("name")} error={errors.name} autoComplete="name" textContentType="name" maxLength={80} />
            <TextField label="Mobile number" value={f.phone} onChangeText={set("phone")} error={errors.phone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" maxLength={14} />
            <TextField label="House no., street, landmark" value={f.address} onChangeText={set("address")} error={errors.address} multiline maxLength={200} />
            <TextField label="Area / sector (optional)" value={f.area} onChangeText={set("area")} error={errors.area} maxLength={80} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <TextField label="City" value={f.city} onChangeText={set("city")} error={errors.city} maxLength={60} />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="PIN code" value={f.pincode} onChangeText={set("pincode")} error={errors.pincode} keyboardType="number-pad" maxLength={6} />
              </View>
            </View>
            <TextField label="Note (optional)" value={f.notes} onChangeText={set("notes")} error={errors.notes} maxLength={200} placeholder="e.g. Ring the bell twice" />
          </View>
        </Card>

        <Card title="Delivery slot">
          {slots.error ? (
            <ErrorState compact message={slots.error} onRetry={slots.reload} />
          ) : dates.length === 0 ? (
            <InlineMessage tone="warning">{slots.loading ? "Loading slots…" : "No delivery slots are open right now. Please check back later."}</InlineMessage>
          ) : (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {dates.map((d) => {
                  const any = d.slots.some((s) => s.available);
                  return (
                    <Chip
                      key={d.date}
                      label={formatDateLabel(d.date)}
                      sublabel={any ? undefined : "Unavailable"}
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
                      accessibilityLabel={`${s.label}, ${formatSlotTime(s.startTime)} to ${formatSlotTime(s.endTime)}${s.available ? "" : ", unavailable"}`}
                      style={[styles.option, selected && styles.optionSelected, !s.available && styles.optionDisabled]}
                    >
                      <Radio on={selected} disabled={!s.available} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.optionTitle}>{s.label}</Text>
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

        <Card title="Payment">
          {settingsError && whatsappPaymentMethods.length === 0 ? (
            <ErrorState compact message={settingsError} onRetry={reloadSettings} />
          ) : whatsappPaymentMethods.length === 0 ? (
            <InlineMessage tone="warning">No payment methods are available for WhatsApp orders right now.</InlineMessage>
          ) : (
            <View style={{ gap: 8 }} accessibilityRole="radiogroup">
              {whatsappPaymentMethods.map((m) => {
                const selected = method === m;
                const Icon = m === "cod" ? Banknote : CreditCard;
                const label = METHOD_LABEL[m] ?? { title: m, sub: "" };
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMethod(m)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected, selected }}
                    aria-checked={selected}
                    accessibilityLabel={label.title}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <Radio on={selected} />
                    <Icon size={20} color={colors.forest800} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.optionTitle}>{label.title}</Text>
                      <Text style={type.small}>{label.sub}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Card>

        <Card title="Your basket">
          {cart.lines.map((l) => (
            <View key={l.variantId} style={styles.itemRow}>
              <Text style={styles.itemText} numberOfLines={1}>
                {l.quantity} × {l.productName} <Text style={{ color: colors.muted }}>({l.variantLabel})</Text>
              </Text>
              <Text style={styles.itemPrice}>{formatINR(l.priceHint * l.quantity)}</Text>
            </View>
          ))}
          <Text style={[type.small, { marginTop: 8 }]}>About {formatINR(estimate)} before delivery charges. The exact total is in the WhatsApp message.</Text>
        </Card>

        {placeError ? (
          <View style={{ gap: 6 }} accessibilityLiveRegion="assertive">
            <InlineMessage tone="danger">{placeError}</InlineMessage>
            {rejections.map((r) => (
              <InlineMessage key={r} tone="danger">
                {r}
              </InlineMessage>
            ))}
            {rejections.length > 0 ? <Button label="Review basket" variant="outline" size="sm" onPress={() => router.replace("/cart")} /> : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Button
          label="Send order on WhatsApp"
          variant="primary"
          size="lg"
          fullWidth
          loading={placing}
          disabled={placing || cart.lines.length === 0 || !method || !slotId}
          icon={<MessageCircle size={20} color={colors.white} />}
          onPress={send}
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
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.muted, alignItems: "center", justifyContent: "center", marginTop: 1 },
  radioOn: { borderColor: colors.leaf600 },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.leaf600 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, paddingVertical: 3 },
  itemText: { flex: 1, fontFamily: fonts.regular, fontSize: 14, color: colors.inkSoft },
  itemPrice: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  doneIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.leaf600, alignItems: "center", justifyContent: "center" },
  doneTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.forest900, textAlign: "center" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useId } from "react";
import { ArrowRight, Banknote, CreditCard, FlaskConical, Lock, MapPin, Plus, ShoppingBasket, CalendarClock, QrCode } from "lucide-react";
import { formatINR, formatSlotTime, pincodeStateMessage, stateMatchesPincode, type Address, type PlaceOrderResponse, type SlotOption, type UnavailableItemPreference } from "@freshbasket/shared";
import { UnavailableItemsChoice } from "./unavailable-items-choice";
import { api, ApiError, isDefiniteRejection, newIdempotencyKey } from "@/lib/client/api";
import { useCart } from "./cart-context";
import { useQuote } from "./use-quote";
import { OrderSummary } from "./order-summary";
import { CouponForm } from "./coupon-form";
import { useSession } from "../account/session-context";
import { AddressFields, emptyAddress, validateAddress, type AddressDraft } from "../account/address-form";
import { Button, ButtonLink } from "../ui/button";
import { Checkbox, Textarea } from "../ui/form";
import { EmptyState, Notice, Spinner } from "../ui/feedback";
import { ProductImage } from "../product/product-image";
import { cn } from "../ui/cn";

type Method = "cod" | "razorpay" | "mock" | "upi";

const METHOD_INFO: Record<Method, { title: string; sub: string; icon: typeof Banknote }> = {
  razorpay: { title: "Pay online", sub: "UPI, cards or net banking via Razorpay", icon: CreditCard },
  mock: { title: "Test payment", sub: "Development only — no real money moves", icon: FlaskConical },
  cod: { title: "Cash on delivery", sub: "Pay when your order arrives", icon: Banknote },
  upi: { title: "UPI (scan & pay)", sub: "Pay to our UPI ID — we confirm it before packing", icon: QrCode },
};

function dayLabel(date: string, today: string) {
  const d = new Date(`${date}T00:00:00+05:30`);
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const name = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });
  return { name, date: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) };
}

export function CheckoutView({ paymentMethods }: { paymentMethods: Method[] }) {
  // Unique radio-group names: a second copy of this form (e.g. a page kept in the background) must
  // never share them, or React refuses the click ("Mixing React and non-React radio inputs").
  const rg = useId();
  const router = useRouter();
  const cart = useCart();
  const { lines, hydrated, couponCode } = cart;

  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [addressId, setAddressId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<AddressDraft>(emptyAddress);
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [saveAddress, setSaveAddress] = useState(true);

  const [slots, setSlots] = useState<SlotOption[] | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);

  const [method, setMethod] = useState<Method | null>(paymentMethods[0] ?? null);
  const [note, setNote] = useState("");
  const [whatsappUpdates, setWhatsappUpdates] = useState(false);
  const [unavailableItems, setUnavailableItems] = useState<UnavailableItemPreference>("call");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const placingRef = useRef(false);
  const [placeError, setPlaceError] = useState<{ message: string; messages?: Record<string, string> } | null>(null);
  const idemKey = useRef(newIdempotencyKey());

  useEffect(() => {
    Promise.all([api<{ addresses: Address[] }>("/api/me/addresses"), api<{ slots: SlotOption[] }>("/api/delivery/slots")])
      .then(([a, s]) => {
        setAddresses(a.addresses);
        const def = a.addresses.find((x) => x.isDefault) ?? a.addresses[0];
        setAddressId(def ? def.id : "new");
        if (!def && cart.location) setDraft((d) => ({ ...d, pincode: cart.location!.pincode, city: cart.location!.city }));
        setSlots(s.slots);
        const firstOpen = s.slots.find((x) => x.available);
        if (firstOpen) {
          setDate(firstOpen.date);
          setSlotId(firstOpen.slotId);
        } else if (s.slots[0]) setDate(s.slots[0].date);
      })
      .catch((e) => setLoadError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

  // A new address starts with the name and mobile from the account, so nobody types them twice.
  const { profile } = useSession();
  useEffect(() => {
    if (addressId !== "new" || !profile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time prefill once the account has loaded
    setDraft((d) => ({ ...d, fullName: d.fullName || profile.fullName || "", phone: d.phone || profile.phone || "" }));
  }, [addressId, profile]);

  const selectedAddress = addressId && addressId !== "new" ? addresses?.find((a) => a.id === addressId) : null;
  const pincode = selectedAddress?.pincode ?? (draft.pincode.length === 6 ? draft.pincode : null);
  const { data, loading } = useQuote(pincode);

  // A change to what's being ordered gets a fresh idempotency key. Address fields are left out on
  // purpose: they auto-fill (city/state from PIN) and a key change mid-submit allowed duplicates.
  // The server also refuses an identical order within 2 minutes, whatever the key.
  const payloadKey = JSON.stringify([lines.map((l) => [l.variantId, l.quantity]), couponCode, addressId, slotId, date, method]);
  useEffect(() => {
    idemKey.current = newIdempotencyKey();
  }, [payloadKey]);

  const dates = useMemo(() => [...new Set(slots?.map((s) => s.date) ?? [])], [slots]);
  const today = dates[0] ?? "";

  if (!hydrated || (addresses === null && !loadError)) {
    return (
      <div className="container-page grid gap-8 pt-10 lg:grid-cols-[1fr_24rem]" aria-busy="true">
        <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-40" />)}</div>
        <div className="skeleton h-80" />
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="container-page py-12">
        <Notice tone="error" title="Checkout couldn't load">{loadError}</Notice>
      </div>
    );
  }
  if (lines.length === 0) {
    return (
      <div className="container-page py-12">
        <h1 className="sr-only">Checkout</h1>
        <EmptyState icon={<ShoppingBasket className="size-7" />} title="Your cart is empty" action={<ButtonLink href="/shop">Shop fresh</ButtonLink>}>
          Add items to your cart before checking out.
        </EmptyState>
      </div>
    );
  }

  const quote = data?.quote ?? null;
  const areaMissing = Boolean(pincode) && !loading && data && !data.area;
  const blockingIssue = quote?.issues.find((i) => i.code !== "COUPON_INVALID");

  async function placeOrder() {
    // Synchronous guard: a double click fires twice before React re-renders the disabled button.
    if (placingRef.current) return;
    setPlaceError(null);
    let addressPayload: Record<string, unknown> = {};
    if (addressId === "new" || !addressId) {
      const errs = validateAddress(draft);
      setDraftErrors(errs);
      if (Object.keys(errs).length) {
        document.getElementById("checkout-address")?.scrollIntoView({ behavior: "smooth" });
        return;
      }
      addressPayload = { address: draft, saveAddress };
    } else addressPayload = { addressId };
    if (!slotId || !date) return setPlaceError({ message: "Choose a delivery slot." });
    if (!method) return setPlaceError({ message: "Choose a payment method." });

    placingRef.current = true;
    setPlacing(true);
    try {
      const res = await api<PlaceOrderResponse>("/api/orders", {
        method: "POST",
        json: {
          items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          couponCode,
          ...addressPayload,
          slotId,
          deliveryDate: date,
          paymentMethod: method,
          customerNote: note.trim() || null,
          whatsappUpdates,
          unavailableItems,
          idempotencyKey: idemKey.current,
        },
      });
      cart.clear();
      if (res.payment) {
        const u = new URL(res.payment.payUrl);
        router.push(`${u.pathname}${u.search}`);
      } else {
        router.push(`/orders/${res.order.id}?placed=1`);
      }
    } catch (e) {
      const err = e as ApiError;
      // The basket is kept on every error. A NEW idempotency key is made only when the server definitely
      // didn't keep this attempt (ORDER_CANCELLED, or a 4xx rejection), so the next tap is a fresh order.
      // Offline / timeouts / ambiguous 5xx keep the key: a retry then returns the order if it was saved.
      if (isDefiniteRejection(err)) idemKey.current = newIdempotencyKey();
      const messages = (err.details as { messages?: Record<string, string> } | undefined)?.messages;
      setPlaceError({ message: err.message, messages });
      placingRef.current = false;
      setPlacing(false);
      if (err.status === 401) router.push("/login?next=/checkout");
    }
  }

  const step = (n: number, title: string, icon: React.ReactNode, children: React.ReactNode, id?: string) => (
    <section id={id} aria-labelledby={`step-${n}`} className="rounded-[var(--radius-card)] border border-line bg-white p-5 sm:p-6">
      <h2 id={`step-${n}`} className="flex items-center gap-3 text-xl font-semibold text-forest-900">
        <span className="grid size-9 place-items-center rounded-full bg-lime-100 text-forest-800">{icon}</span>
        <span><span className="sr-only">Step {n}: </span>{title}</span>
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );

  return (
    <div className="container-page pt-6 md:pt-10">
      <h1 className="text-[2.2rem] font-semibold text-forest-900 md:text-5xl">Checkout</h1>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_24rem] lg:items-start lg:gap-8">
        <div className="space-y-5">
          {step(1, "Delivery address", <MapPin className="size-[1.1rem]" />, (
            <div className="space-y-4">
              {addresses && addresses.length > 0 ? (
                <div role="radiogroup" aria-label="Saved addresses" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {addresses.map((a) => (
                    <label key={a.id} className={cn("cursor-pointer rounded-2xl border-2 p-4 text-sm transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lime-200", addressId === a.id ? "border-leaf-500 bg-lime-50" : "border-line hover:border-forest-700/30")}>
                      <input type="radio" name={`${rg}-address`} className="sr-only" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                      <span className="flex items-center gap-2 font-semibold text-ink">
                        {a.label}
                        {a.isDefault ? <span className="rounded-full bg-sage-100 px-2 py-0.5 text-[0.6875rem] font-medium text-muted">Default</span> : null}
                      </span>
                      <span className="mt-1 block text-ink-soft">{a.fullName} · {a.phone}</span>
                      <span className="block text-muted">{[a.line1, a.line2, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(", ")}</span>
                      {!stateMatchesPincode(a.state, a.pincode) ? (
                        <span className="mt-1.5 block font-medium text-amber">
                          {pincodeStateMessage(a.pincode)} <Link href="/account/addresses" className="underline">Edit address</Link>
                        </span>
                      ) : null}
                    </label>
                  ))}
                  <label className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-sm font-semibold transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lime-200", addressId === "new" ? "border-leaf-500 bg-lime-50 text-forest-900" : "border-line text-forest-800 hover:border-forest-700/30")}>
                    <input type="radio" name={`${rg}-address`} className="sr-only" checked={addressId === "new"} onChange={() => setAddressId("new")} />
                    <Plus className="size-4" aria-hidden /> New address
                  </label>
                </div>
              ) : null}
              {addressId === "new" ? (
                <div className="space-y-4">
                  <AddressFields value={draft} onChange={setDraft} errors={draftErrors} idPrefix="checkout" />
                  <Checkbox label="Save this address for next time" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                </div>
              ) : null}
              {areaMissing ? <Notice tone="warning" title="We don't deliver to this PIN code yet">Choose a different address to continue.</Notice> : null}
            </div>
          ), "checkout-address")}

          {step(2, "Delivery slot", <CalendarClock className="size-[1.1rem]" />, (
            slots && slots.length ? (
              <div className="space-y-4">
                <div role="tablist" aria-label="Delivery date" className="no-scrollbar flex gap-2 overflow-x-auto">
                  {dates.map((d) => {
                    const l = dayLabel(d, today);
                    const any = slots.some((s) => s.date === d && s.available);
                    return (
                      <button
                        key={d}
                        type="button"
                        role="tab"
                        aria-selected={date === d}
                        onClick={() => {
                          setDate(d);
                          setSlotId(slots.find((s) => s.date === d && s.available)?.slotId ?? null);
                        }}
                        className={cn("flex min-w-24 shrink-0 flex-col items-center rounded-2xl border px-4 py-2.5 text-sm", date === d ? "border-forest-800 bg-forest-800 text-white" : "border-line bg-white text-ink-soft hover:border-forest-700/30", !any && "opacity-60")}
                      >
                        <span className="font-semibold">{l.name}</span>
                        <span className={cn("text-xs", date === d ? "text-white/75" : "text-muted")}>{l.date}</span>
                      </button>
                    );
                  })}
                </div>
                <div role="radiogroup" aria-label="Time slot" className="grid gap-2.5 sm:grid-cols-3">
                  {slots.filter((s) => s.date === date).map((s) => (
                    <label key={s.slotId} className={cn("rounded-2xl border-2 p-3.5 text-sm transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lime-200", !s.available ? "cursor-not-allowed border-line bg-sage-50 text-muted" : slotId === s.slotId ? "cursor-pointer border-leaf-500 bg-lime-50" : "cursor-pointer border-line hover:border-forest-700/30")}>
                      <input type="radio" name={`${rg}-slot`} className="sr-only" disabled={!s.available} checked={slotId === s.slotId} onChange={() => setSlotId(s.slotId)} />
                      <span className="block font-semibold text-ink">{s.label}</span>
                      <span className="block tabular-nums text-ink-soft">{formatSlotTime(s.startTime)} – {formatSlotTime(s.endTime)}</span>
                      {!s.available ? <span className="text-xs">Closed or full</span> : null}
                    </label>
                  ))}
                </div>
                {!slots.some((s) => s.date === date && s.available) ? <p className="text-sm text-muted">No slots left on this day — try another date.</p> : null}
              </div>
            ) : (
              <Notice tone="warning">No delivery slots are available right now. Please check back later.</Notice>
            )
          ))}

          {step(3, "Payment", <Lock className="size-[1.1rem]" />, (
            paymentMethods.length ? (
              <div className="space-y-4">
                <div role="radiogroup" aria-label="Payment method" className="grid gap-2.5 sm:grid-cols-2">
                  {paymentMethods.map((m) => {
                    const info = METHOD_INFO[m];
                    const Icon = info.icon;
                    return (
                      <label key={m} className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 text-sm transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lime-200", method === m ? "border-leaf-500 bg-lime-50" : "border-line hover:border-forest-700/30")}>
                        <input type="radio" name={`${rg}-method`} className="sr-only" checked={method === m} onChange={() => setMethod(m)} />
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-forest-800 ring-1 ring-line"><Icon className="size-5" aria-hidden /></span>
                        <span>
                          <span className="block font-semibold text-ink">{info.title}</span>
                          <span className="block text-muted">{info.sub}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {method === "mock" ? <Notice tone="warning" title="Test mode">Razorpay keys aren&apos;t configured, so this simulates a payment for testing. No money is charged.</Notice> : null}
                {method === "upi" ? (
                  <p className="text-xs text-muted">After placing the order you&apos;ll see our UPI QR with the exact amount. Your order is confirmed once we see the payment (items held for 24 hours).</p>
                ) : method && method !== "cod" ? <p className="text-xs text-muted">Items are held for you for 15 minutes while you pay.</p> : null}
                <UnavailableItemsChoice value={unavailableItems} onChange={setUnavailableItems} />
                <div>
                  <label htmlFor="note" className="text-sm font-medium text-ink-soft">Delivery note (optional)</label>
                  <Textarea id="note" maxLength={300} className="mt-1.5 min-h-20" placeholder="e.g. Ring the bell twice, leave with security" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <Checkbox
                  checked={whatsappUpdates}
                  onChange={(e) => setWhatsappUpdates(e.target.checked)}
                  label="Send me order updates on WhatsApp (confirmed, packed, out for delivery, delivered)"
                />
              </div>
            ) : (
              <Notice tone="error">No payment methods are enabled. Please contact the store.</Notice>
            )
          ))}
        </div>

        <aside id="checkout-summary" className="scroll-mt-[calc(var(--header-h,5rem)+1rem)] space-y-4 lg:sticky lg:top-28">
          <OrderSummary
            quote={quote}
            delivery={data?.area ? "known" : "unknown"}
            freeAbove={data?.area?.freeAbove}
            freeAboveFallback={data?.commonFreeAbove}
            localLines={lines.map((l) => ({ quantity: l.quantity, unitPrice: l.priceHint }))}
            loading={loading}
          >
            <div className="space-y-4">
              <ul className="max-h-48 space-y-2 overflow-auto pr-1 text-sm" aria-label="Items">
                {lines.map((l) => (
                  <li key={l.variantId} className="flex items-center gap-3">
                    <ProductImage src={l.imageUrl} alt="" sizes="40px" className="size-10 shrink-0 rounded-lg bg-sage-50" />
                    <span className="min-w-0 flex-1 truncate">{l.productName} <span className="text-muted">· {l.variantLabel} × {l.quantity}</span></span>
                    {data?.messages[l.variantId] ? <span className="text-xs text-danger">{data.messages[l.variantId]}</span> : null}
                  </li>
                ))}
              </ul>
              <CouponForm applied={quote?.couponCode ?? null} error={data?.messages._coupon} />
              {data?.messages._cart && pincode ? <Notice tone="warning">{data.messages._cart}</Notice> : null}
              {placeError ? (
                <Notice tone="error" title={placeError.message}>
                  {placeError.messages ? <ul className="list-disc pl-4">{Object.entries(placeError.messages).map(([k, m]) => <li key={k}>{lines.find((l) => l.variantId === k)?.productName ? `${lines.find((l) => l.variantId === k)!.productName}: ` : ""}{m}</li>)}</ul> : null}
                </Notice>
              ) : null}
              <Button size="lg" variant="dark" className="w-full" loading={placing} disabled={placing || !quote || Boolean(blockingIssue && pincode) || !slotId || !method} onClick={placeOrder}>
                {placing ? "Placing order…" : method === "cod" ? <>Place order · {quote ? formatINR(quote.total) : ""}</> : <>Continue to payment <ArrowRight className="size-5" aria-hidden /></>}
              </Button>
              <p className="text-center text-xs text-muted">
                Totals are confirmed by our server when you place the order. By placing the order you agree to our <Link href="/terms" className="underline">terms</Link>.
              </p>
            </div>
          </OrderSummary>
          {loading && !quote ? <Spinner className="mx-auto size-5 text-muted" /> : null}
        </aside>
      </div>
      {/* Phones: the summary is below a long form, so keep the total and a way to it in view. */}
      <div className="h-20 lg:hidden" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-16px_rgb(11_102_35/0.35)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <p className="leading-tight">
            <span className="block text-xs text-muted">Total{data?.area ? "" : " (+ delivery)"}</span>
            <span className="text-lg font-bold tabular-nums text-forest-900">{quote ? formatINR(quote.total) : "…"}</span>
          </p>
          <a href="#checkout-summary" className="inline-flex h-11 items-center gap-2 rounded-full bg-forest-800 px-5 font-semibold text-white hover:bg-forest-900">
            Review &amp; place order <ArrowRight className="size-4" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}

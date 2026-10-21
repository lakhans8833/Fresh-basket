"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, useId } from "react";
import { Banknote, Building2, CalendarClock, CheckCircle2, CreditCard, ExternalLink, Home, MapPin, NotebookPen, Pencil, Phone, QrCode, ShieldCheck, ShoppingBasket, Truck, UserRound } from "lucide-react";
import {
  buildWhatsAppUrl, formatINR, formatSlotTime, isValidPincode, PAYMENT_METHOD_LABEL, whatsappCustomerSchema,
  type QuoteIssue, type SlotOption, type WhatsAppCustomer, type WhatsAppCustomerInput, type UnavailableItemPreference } from "@freshbasket/shared";
import { UnavailableItemsChoice } from "./unavailable-items-choice";
import { api, ApiError, isDefiniteRejection, newIdempotencyKey } from "@/lib/client/api";
import { useSession } from "../account/session-context";
import { UpiPayPanel, type UpiInfo } from "../account/upi-pay-panel";
import { useCart } from "./cart-context";
import { useQuote } from "./use-quote";
import { OrderSummary } from "./order-summary";
import { loadSavedCustomer, saveCustomer } from "./saved-customer";
import { ProductImage } from "../product/product-image";
import { Button, ButtonLink } from "../ui/button";
import { Checkbox } from "../ui/form";
import { EmptyState, Notice } from "../ui/feedback";
import { useToast } from "../ui/toast";
import { WhatsAppIcon } from "../ui/whatsapp-icon";
import { cn } from "../ui/cn";
import { dayLabel, SlotPicker } from "./slot-picker";

const BLOCKING: QuoteIssue["code"][] = ["OUT_OF_STOCK", "UNAVAILABLE", "INVALID_QUANTITY", "EMPTY_CART", "TOO_MANY_LINES", "BELOW_MIN_ORDER"];

type Form = Required<Pick<WhatsAppCustomerInput, "name" | "phone" | "address" | "city" | "pincode">> & { area: string; notes: string };
export type WaMethod = "cod" | "upi" | "razorpay_link";

const WA_METHOD_INFO: Record<WaMethod, { title: string; sub: string; icon: typeof Banknote }> = {
  cod: { title: "Cash on delivery", sub: "Pay in cash when your order arrives", icon: Banknote },
  upi: { title: "UPI (scan & pay)", sub: "Pay to our UPI ID — we confirm it before packing", icon: QrCode },
  razorpay_link: { title: "Pay online", sub: "Secure Razorpay link — UPI, cards, net banking", icon: CreditCard },
};

interface PlacedWaOrder {
  order: { id: string; orderNumber: string; status: string; paymentMethod: WaMethod; paymentStatus: string; total: number; upiReference: string | null; reservationExpiresAt: string | null };
  trackKey: string;
  trackUrl: string;
  whatsappUrl: string;
  payLink: string | null;
  upi: UpiInfo | null;
}

function IconInput({
  id, label, icon, error, required, hint, className, ...rest
}: React.ComponentProps<"input"> & { id: string; label: string; icon: React.ReactNode; error?: string; hint?: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label} {required ? <span className="text-danger" aria-hidden>*</span> : null}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft">{icon}</span>
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          aria-required={required || undefined}
          className="h-12 w-full rounded-xl border border-line bg-white pl-11 pr-3.5 text-[0.9375rem] text-ink placeholder:text-muted/70 focus:border-leaf-600 focus:outline-none focus:ring-4 focus:ring-lime-200/70 aria-[invalid=true]:border-danger/60"
          {...rest}
        />
      </div>
      {error ? <p id={`${id}-error`} className="text-[0.8125rem] text-danger">{error}</p> : hint ? <p id={`${id}-hint`} className="text-[0.8125rem] text-muted">{hint}</p> : null}
    </div>
  );
}

export function WhatsAppOrderView({
  whatsappNumber, storeName, defaultCity, paymentMethods,
}: { whatsappNumber: string | null; storeName: string; defaultCity: string; paymentMethods: WaMethod[] }) {
  // Unique radio-group names: a second copy of this form (e.g. a page kept in the background) must
  // never share them, or React refuses the click ("Mixing React and non-React radio inputs").
  const rg = useId();
  const router = useRouter();
  const toast = useToast();
  const cart = useCart();
  const { profile } = useSession();
  const { lines, hydrated, couponCode } = cart;
  const [form, setForm] = useState<Form>({ name: "", phone: "", address: "", area: "", city: defaultCity, pincode: "", notes: "" });
  const [remember, setRemember] = useState(true);
  const [method, setMethod] = useState<WaMethod | null>(paymentMethods[0] ?? null);
  const [whatsappUpdates, setWhatsappUpdates] = useState(false);
  const [unavailableItems, setUnavailableItems] = useState<UnavailableItemPreference>("call");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [review, setReview] = useState<WhatsAppCustomer | null>(null);
  const [placing, setPlacing] = useState(false);
  const placingRef = useRef(false);
  const [placed, setPlaced] = useState<PlacedWaOrder | null>(null);
  /** Did the WhatsApp tab actually open? (false when a pop-up blocker stopped it) */
  const [waOpened, setWaOpened] = useState(true);
  const idemKey = useRef(newIdempotencyKey());
  // Delivery date + slot (shared capacity with website orders). null = still loading; [] = no slots set up.
  const [slots, setSlots] = useState<SlotOption[] | null>(null);
  const [slotsError, setSlotsError] = useState(false);
  const [date, setDate] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);

  const loadSlots = () =>
    api<{ slots: SlotOption[] }>("/api/delivery/slots", { cache: "no-store" }).then(
      (r) => {
        setSlotsError(false);
        setSlots(r.slots);
        const first = r.slots.find((x) => x.available);
        setDate((d) => (d && r.slots.some((x) => x.date === d) ? d : first?.date ?? r.slots[0]?.date ?? null));
        setSlotId((id) => (id && r.slots.some((x) => x.slotId === id && x.available) ? id : first?.slotId ?? null));
      },
      // A failed request is NOT "no slots set up": keep the form blocked until slots load.
      () => setSlotsError(true),
    );
  useEffect(() => {
    void loadSlots();
  }, []);
  const chosenSlot = slots?.find((x) => x.slotId === slotId && x.date === date) ?? null;
  const slotText = chosenSlot ? `${dayLabel(chosenSlot.date, slots?.[0]?.date ?? chosenSlot.date).name}, ${dayLabel(chosenSlot.date, chosenSlot.date).date} · ${chosenSlot.label}, ${formatSlotTime(chosenSlot.startTime)}–${formatSlotTime(chosenSlot.endTime)}` : null;

  useEffect(() => {
    const saved = loadSavedCustomer();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- prefill from this device after mount
    setForm((f) => ({
      ...f,
      ...Object.fromEntries(Object.entries(saved ?? {}).filter(([, v]) => typeof v === "string" && v)),
      pincode: saved?.pincode || cart.location?.pincode || f.pincode,
      city: saved?.city || cart.location?.city || f.city,
      notes: "",
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);

  const pinValid = isValidPincode(form.pincode);
  const { data, loading, error: quoteError } = useQuote(pinValid ? form.pincode : null);
  const quote = data?.quote ?? null;
  const area = data?.area ?? null;
  const delivery: "known" | "confirm" | "unknown" = !pinValid ? "unknown" : area ? "known" : "confirm";
  const blocking = useMemo(() => quote?.issues.filter((i) => BLOCKING.includes(i.code)) ?? [], [quote]);
  // Show items in the order the customer added them.
  const orderedLines = useMemo(() => {
    const pos = new Map(lines.map((l, i) => [l.variantId, i]));
    return [...(quote?.lines ?? [])].sort((a, b) => (pos.get(a.variantId) ?? 0) - (pos.get(b.variantId) ?? 0));
  }, [quote, lines]);
  const guestCoupon = !profile && Boolean(couponCode);

  // A new order (different items, details or payment) gets a new key; resubmitting the same one reuses it.
  const payloadKey = JSON.stringify([lines.map((l) => [l.variantId, l.quantity]), couponCode, form, method, date, slotId]);
  useEffect(() => {
    idemKey.current = newIdempotencyKey();
  }, [payloadKey]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = k === "pincode" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: "" }));
  };

  /** Step 1: check the details, then show the full order summary for the customer to confirm. */
  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = whatsappCustomerSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.message;
      setErrors(next);
      document.getElementById(`wa-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    if (!whatsappNumber) return setFormError("WhatsApp ordering isn't set up yet. Please use Proceed to Checkout instead.");
    if (!quote || loading) return setFormError("Prices are still updating — please try again in a moment.");
    if (!area) return setFormError("We don't deliver to this PIN code yet. Message us on WhatsApp to ask, or try another address.");
    if (blocking.length) return setFormError("Some items in your cart need attention before you can order.");
    if (guestCoupon) return setFormError("Coupons need an account. Sign in to use your coupon, or remove it in the cart to order as a guest.");
    if (slots === null) {
      return setFormError(slotsError ? "Couldn't load delivery times. Tap “Try again” in step 3." : "Delivery slots are still loading — please try again in a moment.");
    }
    if (slots.length > 0 && !chosenSlot) {
      document.getElementById("wa-slot-step")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return setFormError("Choose a delivery date and time slot.");
    }
    if (!method) return setFormError("Choose how you'll pay.");
    setReview(parsed.data);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Step 2: save the order on our server, then open WhatsApp with its real order ID and totals. */
  async function confirmOrder() {
    if (!review || !method || placingRef.current) return;
    placingRef.current = true;
    setPlacing(true);
    setFormError(null);
    // Open the WhatsApp tab inside the click (pop-up blockers), then point it at the message.
    const win = window.open("", "_blank");
    try {
      if (win) win.opener = null;
    } catch {
      /* ignore */
    }
    try {
      const r = await api<PlacedWaOrder>("/api/whatsapp-orders", {
        method: "POST",
        json: {
          items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          customer: review,
          paymentMethod: method,
          couponCode: profile ? couponCode : null,
          whatsappUpdates,
          unavailableItems,
          idempotencyKey: idemKey.current,
          deliveryDate: chosenSlot ? chosenSlot.date : null,
          slotId: chosenSlot ? chosenSlot.slotId : null,
        },
      });
      saveCustomer(remember ? review : null);
      cart.clear();
      setPlaced(r);
      setReview(null);
      const opened = Boolean(win && !win.closed && "location" in win);
      if (opened) win!.location.href = r.whatsappUrl;
      setWaOpened(opened);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      try {
        win?.close();
      } catch {
        /* ignore */
      }
      const err = e as ApiError;
      // The server definitely rejected it (4xx, e.g. slot full, order cancelled): the next attempt is a new
      // order with a new key. Offline (status 0), rate limit or a server error (5xx) keeps the key, because
      // the order may already be saved — a retry then returns that same order instead of a second one.
      if (isDefiniteRejection(err)) idemKey.current = newIdempotencyKey();
      const slotFull = Boolean((err.details as { messages?: Record<string, string> } | undefined)?.messages?._slot);
      if (slotFull) {
        // That slot filled up meanwhile: back to the form with fresh slots so another can be picked.
        void loadSlots();
        setReview(null);
      }
      setFormError(err.message || "Couldn't place the order. Please try again.");
    } finally {
      placingRef.current = false;
      setPlacing(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="container-page grid gap-6 pt-8 lg:grid-cols-[minmax(0,1fr)_28rem]" aria-busy="true">
        <div className="skeleton h-[32rem]" />
        <div className="skeleton h-96" />
      </div>
    );
  }

  if (placed) {
    const o = placed.order;
    const trackPath = (() => {
      try {
        const u = new URL(placed.trackUrl);
        return `${u.pathname}${u.search}`;
      } catch {
        return placed.trackUrl;
      }
    })();
    return (
      <div className="container-page py-8 md:py-10">
        <div className="mx-auto max-w-2xl rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-8" role="status">
          <div className="text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-whatsapp text-white"><WhatsAppIcon className="size-9" /></span>
            <h2 className="mt-4 text-2xl font-bold text-forest-800">Order {o.orderNumber} is saved</h2>
            <p className="mt-2 text-ink-soft">
              {waOpened
                ? <>WhatsApp has opened with your order details — press <b>Send</b> there so we can confirm quickly.</>
                : <>Now tap <b>Send order on WhatsApp</b> below and press <b>Send</b> in WhatsApp — we only get your order once you send it.</>}{" "}
              Total <b className="text-ink">{formatINR(o.total)}</b> · {PAYMENT_METHOD_LABEL[o.paymentMethod]}.
            </p>
          </div>
          {o.paymentMethod === "upi" && placed.upi ? (
            <UpiPayPanel orderId={o.id} orderNumber={o.orderNumber} trackKey={placed.trackKey} info={placed.upi} reported={o.upiReference} holdUntil={o.reservationExpiresAt} />
          ) : o.paymentMethod === "razorpay_link" && placed.payLink ? (
            <Notice tone="warning" className="mt-5" title="Payment pending">
              Pay {formatINR(o.total)} on the secure Razorpay page. Your order is confirmed automatically once Razorpay confirms the payment.
              <div className="mt-3">
                <a href={placed.payLink} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full bg-forest-800 px-5 font-semibold text-white hover:bg-forest-900">
                  <CreditCard className="size-4" aria-hidden /> Pay {formatINR(o.total)} now <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </div>
            </Notice>
          ) : o.paymentMethod === "cod" ? (
            <Notice tone="info" className="mt-5">Cash on delivery — please keep {formatINR(o.total)} ready. Nothing to pay now. We&apos;ll confirm your order on WhatsApp.</Notice>
          ) : (
            <Notice tone="warning" className="mt-5" title="Payment pending">Open your order page to see how to pay {formatINR(o.total)}, or message us on WhatsApp.</Notice>
          )}
          <div className="mt-6 flex flex-col gap-3">
            <a href={placed.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-whatsapp-dark px-5 font-semibold text-white hover:bg-forest-800">
              <WhatsAppIcon className="size-5" /> {waOpened ? "Open WhatsApp again" : "Send order on WhatsApp"}
            </a>
            <ButtonLink href={trackPath} variant="outline" size="lg" className="rounded-xl">
              <Truck className="size-5" aria-hidden /> Track this order
            </ButtonLink>
            <button type="button" onClick={() => { toast("Thanks for ordering!"); router.push("/"); }} className="text-sm font-semibold text-forest-800 hover:underline">
              <CheckCircle2 className="mr-1 inline size-4 text-leaf-600" aria-hidden /> Done — back to the shop
            </button>
          </div>
          <p className="mt-5 text-center text-xs text-muted">Save the tracking link — it&apos;s also in your WhatsApp message. Didn&apos;t open? Make sure WhatsApp is installed, or use WhatsApp Web on a computer.</p>
        </div>
      </div>
    );
  }

  if (review && quote) {
    return (
      <div className="container-page py-8 md:py-10">
        <section aria-labelledby="review-h" className="mx-auto max-w-2xl rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-8">
          <h2 id="review-h" className="text-2xl font-bold text-forest-800">Check your order</h2>
          <p className="mt-1 text-sm text-ink-soft">This is exactly what we&apos;ll save and send on WhatsApp.</p>
          <ul className="mt-5 divide-y divide-line rounded-xl border border-line">
            {orderedLines.map((l) => (
              <li key={l.variantId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0"><b className="text-ink">{l.productName}</b> <span className="text-muted">({l.variantLabel}) × {l.quantity}</span></span>
                <span className="font-semibold tabular-nums">{formatINR(l.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1.5 text-[0.9375rem]">
            <div className="flex justify-between"><dt className="text-ink-soft">Subtotal</dt><dd className="tabular-nums">{formatINR(quote.subtotal)}</dd></div>
            {quote.discount > 0 ? <div className="flex justify-between"><dt className="text-ink-soft">Discount ({quote.couponCode})</dt><dd className="tabular-nums text-leaf-600">−{formatINR(quote.discount)}</dd></div> : null}
            <div className="flex justify-between"><dt className="text-ink-soft">Delivery</dt><dd className="tabular-nums">{quote.deliveryFee ? formatINR(quote.deliveryFee) : "Free"}</dd></div>
            <div className="flex justify-between border-t border-dashed border-line pt-2 text-lg font-bold"><dt>Total</dt><dd className="tabular-nums text-forest-800">{formatINR(quote.total)}</dd></div>
          </dl>
          <div className="mt-5 grid gap-4 rounded-xl bg-sage-50 p-4 text-sm sm:grid-cols-2">
            <div>
              <p className="font-semibold text-ink">Deliver to</p>
              <p className="text-ink-soft">{review.name} · +91 {review.phone}</p>
              <p className="text-ink-soft">{[review.address, review.area, review.city, review.pincode].filter(Boolean).join(", ")}</p>
              {review.notes ? <p className="mt-1 text-muted">“{review.notes}”</p> : null}
              <p className="mt-2 font-semibold text-ink">Delivery</p>
              <p className="text-ink-soft">{slotText ?? "Time agreed with you on WhatsApp"}</p>
            </div>
            <div>
              <p className="font-semibold text-ink">Payment</p>
              <p className="text-ink-soft">{method ? WA_METHOD_INFO[method].title : ""}</p>
              <p className="text-muted">{method === "cod" ? "Pay when it arrives" : method === "upi" ? "UPI QR shown next — we confirm the payment before packing" : "Secure payment link shown next"}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">Prices and charges are checked again on our server when you confirm.</p>
          {formError ? <Notice tone="error" className="mt-4">{formError}</Notice> : null}
          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row-reverse">
            <Button size="lg" className="rounded-xl sm:flex-1" loading={placing} onClick={confirmOrder}>
              <WhatsAppIcon className="size-5" /> Confirm &amp; send on WhatsApp
            </Button>
            <Button size="lg" variant="outline" className="rounded-xl" disabled={placing} onClick={() => { setReview(null); void loadSlots(); }}>
              <Pencil className="size-4" aria-hidden /> Edit details
            </Button>
          </div>
        </section>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="container-page py-10">
        <EmptyState icon={<ShoppingBasket className="size-7" />} title="Your cart is empty" action={<ButtonLink href="/shop">Start shopping</ButtonLink>}>
          Add items to your cart before ordering on WhatsApp.
        </EmptyState>
      </div>
    );
  }

  const itemsTable = (
    <div className="mt-4">
      <div className="grid grid-cols-[minmax(0,1fr)_2.75rem_4.25rem] gap-2 border-b border-line pb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft sm:grid-cols-[minmax(0,1fr)_4.5rem_3.5rem_4.5rem]">
        <span>Product</span><span className="hidden sm:block">Price</span><span>Qty</span><span className="text-right">Total</span>
      </div>
      <ul className="divide-y divide-line">
        {orderedLines.map((l) => {
          const cartLine = lines.find((x) => x.variantId === l.variantId);
          return (
            <li key={l.variantId} className="grid grid-cols-[minmax(0,1fr)_2.75rem_4.25rem] items-center gap-2 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_4.5rem_3.5rem_4.5rem]">
              <span className="flex min-w-0 items-center gap-2.5">
                <ProductImage src={cartLine?.imageUrl ?? null} alt="" sizes="44px" className="size-11 shrink-0 rounded-lg border border-line bg-white" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{l.productName}</span>
                  <span className="block text-xs text-muted">{l.variantLabel}<span className="sm:hidden"> · {formatINR(l.unitPrice)}</span></span>
                </span>
              </span>
              <span className="hidden tabular-nums text-ink-soft sm:block">{formatINR(l.unitPrice)}</span>
              <span className="tabular-nums text-ink-soft">× {l.quantity}</span>
              <span className="text-right font-semibold tabular-nums text-ink">{formatINR(l.lineTotal)}</span>
            </li>
          );
        })}
      </ul>
      {data ? Object.entries(data.messages).filter(([k]) => k !== "_cart" && k !== "_coupon").map(([k, m]) => (
        <p key={k} className="text-sm text-danger" role="alert">{lines.find((x) => x.variantId === k)?.productName ?? "Item"}: {m}</p>
      )) : null}
    </div>
  );

  return (
    <div className="container-page pt-6 md:pt-8">
      {!whatsappNumber ? (
        <Notice tone="warning" className="mb-5" title="WhatsApp ordering isn't set up yet">
          The store owner needs to add a WhatsApp number. You can still place your order with{" "}
          <Link href="/checkout" className="font-semibold underline">Proceed to Checkout</Link>.
        </Notice>
      ) : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_30rem]">
        <form onSubmit={submit} noValidate className="min-w-0 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-7" aria-labelledby="details-title">
          <div className="flex items-center gap-4">
            <UserRound className="size-12 shrink-0 text-forest-800" strokeWidth={1.8} aria-hidden />
            <div>
              <h2 id="details-title" className="text-2xl font-bold text-forest-800">Checkout Details</h2>
              <p className="text-ink-soft">Please fill in your details to place your order.</p>
            </div>
          </div>

          <fieldset className="mt-6">
            <legend className="flex items-center gap-3 text-lg font-semibold text-ink"><span className="grid size-8 place-items-center rounded-full bg-forest-800 text-sm font-bold text-white">1</span> Customer Information</legend>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <IconInput id="wa-name" label="Full Name" required icon={<UserRound className="size-[1.1rem]" />} placeholder="Enter your full name" autoComplete="name" maxLength={80} value={form.name} onChange={set("name")} error={errors.name} />
              <IconInput id="wa-phone" label="Mobile Number" required icon={<Phone className="size-[1.1rem]" />} placeholder="10-digit mobile number" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={16} value={form.phone} onChange={set("phone")} error={errors.phone} />
            </div>
          </fieldset>

          <div className="mt-7 border-t border-line pt-6"><fieldset>
            <legend className="flex items-center gap-3 text-lg font-semibold text-ink"><span className="grid size-8 place-items-center rounded-full bg-forest-800 text-sm font-bold text-white">2</span> <MapPin className="size-5 text-forest-800" aria-hidden /> Delivery Address</legend>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <IconInput id="wa-address" className="sm:col-span-2" label="Address" required icon={<Home className="size-[1.1rem]" />} placeholder="House no., street, landmark" autoComplete="street-address" maxLength={200} value={form.address} onChange={set("address")} error={errors.address} />
              <IconInput id="wa-area" className="sm:col-span-2" label="Area / Sector (optional)" icon={<MapPin className="size-[1.1rem]" />} placeholder="e.g. Sector 7" maxLength={80} value={form.area} onChange={set("area")} error={errors.area} />
              <IconInput id="wa-city" label="City" required icon={<Building2 className="size-[1.1rem]" />} autoComplete="address-level2" maxLength={60} value={form.city} onChange={set("city")} error={errors.city} />
              <IconInput
                id="wa-pincode"
                label="Pincode"
                required
                icon={<MapPin className="size-[1.1rem]" />}
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={6}
                placeholder="6-digit PIN code"
                value={form.pincode}
                onChange={set("pincode")}
                error={errors.pincode}
                hint={
                  !pinValid ? "Used to work out delivery charges"
                    : loading ? "Checking delivery…"
                    : area ? <span className="text-leaf-600">Delivery to {area.areaName}: {area.fee ? formatINR(area.fee) : "free"}{area.freeAbove !== null ? `, free above ${formatINR(area.freeAbove)}` : ""}</span>
                    : <span className="text-amber">
                        We don&apos;t deliver to this PIN code yet.{" "}
                        {whatsappNumber ? <a className="font-semibold underline" target="_blank" rel="noopener noreferrer" href={buildWhatsAppUrl(whatsappNumber, `Hi ${storeName}, do you deliver to PIN code ${form.pincode}?`)}>Ask us on WhatsApp</a> : null}
                      </span>
                }
              />
            </div>
          </fieldset></div>

          <div id="wa-slot-step" className="mt-7 border-t border-line pt-6"><fieldset>
            <legend className="flex items-center gap-3 text-lg font-semibold text-ink"><span className="grid size-8 place-items-center rounded-full bg-forest-800 text-sm font-bold text-white">3</span> <CalendarClock className="size-5 text-forest-800" aria-hidden /> Delivery Date &amp; Time</legend>
            <div className="mt-4">
              {slots === null && slotsError ? (
                <Notice tone="error">
                  Couldn&apos;t load delivery times.{" "}
                  <button type="button" className="font-semibold underline" onClick={() => void loadSlots()}>Try again</button>
                </Notice>
              ) : slots === null ? (
                <div className="skeleton h-28 w-full" aria-busy="true" />
              ) : slots.length ? (
                <SlotPicker slots={slots} date={date} slotId={slotId} onChange={(d, id) => { setDate(d); setSlotId(id); }} />
              ) : (
                <Notice tone="info">We&apos;ll agree the delivery time with you on WhatsApp.</Notice>
              )}
            </div>
          </fieldset></div>

          <div className="mt-7 border-t border-line pt-6"><fieldset>
            <legend className="flex items-center gap-3 text-lg font-semibold text-ink"><span className="grid size-8 place-items-center rounded-full bg-forest-800 text-sm font-bold text-white">4</span> Order Notes <span className="text-sm font-normal text-muted">(Optional)</span></legend>
            <div className="relative mt-4">
              <label htmlFor="wa-notes" className="sr-only">Order notes</label>
              <NotebookPen className="pointer-events-none absolute left-3.5 top-3.5 size-[1.1rem] text-ink-soft" aria-hidden />
              <textarea
                id="wa-notes"
                value={form.notes}
                onChange={set("notes")}
                maxLength={200}
                rows={3}
                placeholder="Any special instructions? (e.g. early delivery, call before coming)"
                aria-invalid={errors.notes ? true : undefined}
                className="w-full rounded-xl border border-line bg-white py-3 pl-11 pr-3.5 text-[0.9375rem] placeholder:text-muted/70 focus:border-leaf-600 focus:outline-none focus:ring-4 focus:ring-lime-200/70"
              />
              <span className="absolute bottom-2 right-3 text-xs text-muted" aria-live="polite">{form.notes.length}/200</span>
            </div>
          </fieldset></div>

          <div className="mt-7 border-t border-line pt-6"><fieldset>
            <legend className="flex items-center gap-3 text-lg font-semibold text-ink"><span className="grid size-8 place-items-center rounded-full bg-forest-800 text-sm font-bold text-white">5</span> Payment</legend>
            {paymentMethods.length ? (
              <div role="radiogroup" aria-label="Payment method" className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {paymentMethods.map((m) => {
                  const info = WA_METHOD_INFO[m];
                  const Icon = info.icon;
                  return (
                    <label key={m} className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-4 text-sm transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lime-200", method === m ? "border-leaf-500 bg-lime-50" : "border-line hover:border-forest-700/30")}>
                      <input type="radio" name={`${rg}-wa-method`} className="sr-only" checked={method === m} onChange={() => setMethod(m)} />
                      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-forest-800 ring-1 ring-line"><Icon className="size-5" aria-hidden /></span>
                      <span>
                        <span className="block font-semibold text-ink">{info.title}</span>
                        <span className="block text-muted">{info.sub}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <Notice tone="error" className="mt-4">No payment method is available for WhatsApp orders right now. Please use Proceed to Checkout.</Notice>
            )}
          </fieldset></div>

          <div className="mt-6 space-y-4">
            <UnavailableItemsChoice value={unavailableItems} onChange={setUnavailableItems} />
            <Checkbox label="Remember my details on this device" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <Checkbox
              label="Send me order updates on WhatsApp (confirmed, packed, out for delivery, delivered)"
              checked={whatsappUpdates}
              onChange={(e) => setWhatsappUpdates(e.target.checked)}
            />
            {guestCoupon ? (
              <Notice tone="warning">Coupon {couponCode} needs an account. <Link href="/login?next=/order" className="font-semibold underline">Sign in</Link> to use it, or remove it in the cart to order as a guest.</Notice>
            ) : null}
            {formError ? <Notice tone="error">{formError}</Notice> : null}
            {quoteError ? <Notice tone="error">{quoteError}</Notice> : null}
            <Button type="submit" size="lg" className="w-full rounded-xl text-lg" disabled={!whatsappNumber || loading || !quote || !paymentMethods.length}>
              <WhatsAppIcon className="size-6" /> Review order
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-center text-sm text-leaf-600">
              <ShieldCheck className="size-4" aria-hidden /> You&apos;ll see the full summary before anything is sent.
            </p>
          </div>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-32">
          <OrderSummary
            quote={quote}
            delivery={delivery}
            freeAbove={area?.freeAbove}
            freeAboveFallback={data?.commonFreeAbove}
            localLines={lines.map((l) => ({ quantity: l.quantity, unitPrice: l.priceHint }))}
            loading={loading}
            items={itemsTable}
            headerAction={<Link href="/cart" className="inline-flex items-center gap-1 text-sm font-semibold text-forest-800 hover:underline"><Pencil className="size-3.5" aria-hidden /> Edit Cart</Link>}
          >
            {couponCode && quote && !quote.couponCode ? <Notice tone="warning">{data?.messages._coupon ?? "Coupon not applied."}</Notice> : null}
            {data?.messages._cart && area ? <Notice tone="warning">{data.messages._cart}</Notice> : null}
            <div className="flex items-start gap-3 rounded-xl bg-sage-50 p-3.5 text-sm text-ink-soft">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-whatsapp text-white"><WhatsAppIcon className="size-6" /></span>
              <p>We save your order with an order ID, then WhatsApp opens with the details. Press <b>Send</b> there so we can confirm quickly.</p>
            </div>
          </OrderSummary>
          <p className="px-1 text-xs leading-relaxed text-muted">
            Prices, delivery charges and the total are calculated on our server when you confirm. Online and UPI payments show as “Payment pending” until the payment is verified.
          </p>
        </aside>
      </div>
    </div>
  );
}

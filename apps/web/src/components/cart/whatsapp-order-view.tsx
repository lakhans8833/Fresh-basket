"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Banknote, Building2, CalendarClock, CheckCircle2, Clock3, CreditCard, Home, MapPin, NotebookPen, Pencil, Phone, QrCode,
  ShieldCheck, ShoppingBasket, UserRound,
} from "lucide-react";
import {
  BOOKING_PAYMENT_LABEL, formatINR, formatSlotTime, isValidPincode, whatsappCustomerSchema,
  type BookingPaymentMethod, type QuoteIssue, type SlotOption, type WhatsAppCustomerInput,
} from "@freshbasket/shared";
import { api, ApiError, newIdempotencyKey } from "@/lib/client/api";
import { useCart } from "./cart-context";
import { useQuote } from "./use-quote";
import { OrderSummary } from "./order-summary";
import { loadSavedCustomer, saveCustomer } from "./saved-customer";
import { UpiQr } from "./upi-qr";
import { ProductImage } from "../product/product-image";
import { Button, ButtonLink } from "../ui/button";
import { Checkbox } from "../ui/form";
import { EmptyState, Notice } from "../ui/feedback";
import { useToast } from "../ui/toast";
import { WhatsAppIcon } from "../ui/whatsapp-icon";
import { cn } from "../ui/cn";

const BLOCKING: QuoteIssue["code"][] = ["OUT_OF_STOCK", "UNAVAILABLE", "INVALID_QUANTITY", "EMPTY_CART", "TOO_MANY_LINES", "BELOW_MIN_ORDER"];
const RESULT_KEY = "fb_wa_booking_v1";

type Form = Required<Pick<WhatsAppCustomerInput, "name" | "phone" | "address" | "city" | "pincode">> & { area: string; notes: string };

interface BookingResult {
  booking: {
    id: string; bookingNumber: string; status: string; statusLabel: string; paymentMethod: BookingPaymentMethod; paymentStatus: string;
    deliveryDate: string; slotLabel: string; subtotal: number; deliveryFee: number; total: number; paymentLinkUrl: string | null;
    items: { productName: string; variantLabel: string; quantity: number; lineTotal: number }[];
  };
  created: boolean;
  whatsappUrl: string;
  upiLink: string | null;
}

const PAYMENT_INFO: Record<BookingPaymentMethod, { icon: React.ReactNode; text: string }> = {
  upi_qr: { icon: <QrCode className="size-5" aria-hidden />, text: "Scan a QR code with any UPI app (GPay, PhonePe, Paytm) after booking." },
  razorpay_link: { icon: <CreditCard className="size-5" aria-hidden />, text: "Get a secure Razorpay link — pay by UPI, card or net banking." },
  cod: { icon: <Banknote className="size-5" aria-hidden />, text: "Pay cash when your vegetables arrive." },
};

function dayLabel(date: string, today: string) {
  const d = new Date(`${date}T00:00:00+05:30`);
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const name = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" });
  return { name, date: d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) };
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

function Step({ n, title, icon, children, optional }: { n: number; title: string; icon?: React.ReactNode; children: React.ReactNode; optional?: boolean }) {
  return (
    <div className={cn(n > 1 && "mt-7 border-t border-line pt-6")}>
      <fieldset>
        <legend className="flex items-center gap-3 text-lg font-semibold text-ink">
          <span className="grid size-8 place-items-center rounded-full bg-forest-800 text-sm font-bold text-white">{n}</span>
          {icon}{title} {optional ? <span className="text-sm font-normal text-muted">(Optional)</span> : null}
        </legend>
        <div className="mt-4">{children}</div>
      </fieldset>
    </div>
  );
}

/** Opens WhatsApp. On a phone this hands over to the WhatsApp app; on a computer a pre-opened tab is pointed at WhatsApp Web. */
function openWhatsApp(url: string, win: Window | null) {
  if (win && !win.closed) {
    win.location.href = url;
    return;
  }
  window.location.href = url;
}

export function WhatsAppOrderView({
  whatsappNumber, defaultCity, paymentMethods,
}: { whatsappNumber: string | null; storeName: string; defaultCity: string; paymentMethods: BookingPaymentMethod[] }) {
  const router = useRouter();
  const toast = useToast();
  const cart = useCart();
  const { lines, hydrated, couponCode } = cart;
  const [form, setForm] = useState<Form>({ name: "", phone: "", address: "", area: "", city: defaultCity, pincode: "", notes: "" });
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [itemMessages, setItemMessages] = useState<Record<string, string>>({});
  const [slots, setSlots] = useState<SlotOption[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [method, setMethod] = useState<BookingPaymentMethod | null>(paymentMethods.length === 1 ? paymentMethods[0]! : null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [website, setWebsite] = useState(""); // honeypot
  // One key per booking attempt: retries / double taps return the same booking instead of a new one.
  const idemKey = useRef<string>("");

  useEffect(() => {
    idemKey.current = newIdempotencyKey();
    // Coming back from WhatsApp (the page may have been reloaded): show the booking that was saved.
    try {
      const saved = sessionStorage.getItem(RESULT_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore after mount
      if (saved) setResult(JSON.parse(saved) as BookingResult);
    } catch { /* storage unavailable */ }
    const c = loadSavedCustomer();
    setForm((f) => ({
      ...f,
      ...Object.fromEntries(Object.entries(c ?? {}).filter(([, v]) => typeof v === "string" && v)),
      pincode: c?.pincode || cart.location?.pincode || f.pincode,
      city: c?.city || cart.location?.city || f.city,
      notes: "",
    }));
    api<{ slots: SlotOption[] }>("/api/delivery/slots").then(
      (r) => {
        setSlots(r.slots);
        const first = r.slots.find((s) => s.available);
        if (first) { setDate(first.date); setSlotId(first.slotId); } else if (r.slots[0]) setDate(r.slots[0].date);
      },
      (e) => setSlotsError(e instanceof Error ? e.message : "Couldn't load delivery slots."),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);

  const pinValid = isValidPincode(form.pincode);
  const { data, loading, error: quoteError } = useQuote(pinValid ? form.pincode : null, { withCoupon: false });
  const quote = data?.quote ?? null;
  const area = data?.area ?? null;
  const delivery: "known" | "confirm" | "unknown" = !pinValid ? "unknown" : area ? "known" : "confirm";
  const blocking = useMemo(() => quote?.issues.filter((i) => BLOCKING.includes(i.code)) ?? [], [quote]);
  const orderedLines = useMemo(() => {
    const pos = new Map(lines.map((l, i) => [l.variantId, i]));
    return [...(quote?.lines ?? [])].sort((a, b) => (pos.get(a.variantId) ?? 0) - (pos.get(b.variantId) ?? 0));
  }, [quote, lines]);
  const dates = useMemo(() => [...new Set(slots?.map((s) => s.date) ?? [])], [slots]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = k === "pincode" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: "" }));
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    setItemMessages({});
    const parsed = whatsappCustomerSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.message;
      setErrors(next);
      document.getElementById(`wa-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    if (!whatsappNumber) return setFormError("WhatsApp booking isn't set up yet. Please use Proceed to Checkout instead.");
    if (!slotId || !date) return setFormError("Please choose a delivery date and time slot.");
    if (!method) return setFormError("Please choose how you'd like to pay.");
    if (!quote || loading) return setFormError("Prices are still updating — please try again in a moment.");
    if (blocking.length) return setFormError("Some items in your cart need attention before you can book.");
    if (!area) return setFormError("Sorry, we don't deliver to this PIN code yet. Please check the PIN code.");

    // Desktop: open the tab now (inside the click) so pop-up blockers allow it; it's pointed at WhatsApp
    // once the booking is saved. Phones: navigate after saving (hands over to the WhatsApp app).
    const isPhone = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    const win = isPhone ? null : window.open("", "_blank");
    setSubmitting(true);
    try {
      const r = await api<BookingResult>("/api/bookings", {
        method: "POST",
        json: {
          customer: form,
          items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
          deliveryDate: date,
          slotId,
          paymentMethod: method,
          idempotencyKey: idemKey.current,
          website,
        },
      });
      saveCustomer(remember ? parsed.data : null);
      setResult(r);
      try { sessionStorage.setItem(RESULT_KEY, JSON.stringify(r)); } catch { /* ignore */ }
      window.scrollTo({ top: 0, behavior: "smooth" });
      openWhatsApp(r.whatsappUrl, win);
    } catch (err) {
      win?.close();
      if (err instanceof ApiError) {
        const msgs = (err.details as { messages?: Record<string, string> } | undefined)?.messages ?? {};
        setItemMessages(msgs);
        if (msgs._slot) {
          // The slot filled up: reload slots so the customer can pick another.
          api<{ slots: SlotOption[] }>("/api/delivery/slots").then((s) => setSlots(s.slots), () => {});
        }
        setFormError(err.message);
      } else setFormError("Couldn't save your booking. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function finish() {
    cart.clear();
    try { sessionStorage.removeItem(RESULT_KEY); } catch { /* ignore */ }
    toast("Thanks! We'll confirm your booking on WhatsApp.");
    router.push("/");
  }

  if (!hydrated) {
    return (
      <div className="container-page grid gap-6 pt-8 lg:grid-cols-[minmax(0,1fr)_28rem]" aria-busy="true">
        <div className="skeleton h-[32rem]" />
        <div className="skeleton h-96" />
      </div>
    );
  }

  if (result) {
    const b = result.booking;
    return (
      <div className="container-page py-8 md:py-10">
        <div className="mx-auto max-w-xl rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-[var(--shadow-card)] sm:p-8" role="status">
          <div className="text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-whatsapp text-white"><WhatsAppIcon className="size-9" /></span>
            <h2 className="mt-4 text-2xl font-bold text-forest-800">Booking saved — now tap Send in WhatsApp</h2>
            <p className="mt-2 text-ink-soft">
              Your booking ID is <b className="text-ink">{b.bookingNumber}</b>. WhatsApp has opened with your booking details —
              press <b>Send</b> there so we receive it.
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber/10 px-3 py-1 text-sm font-semibold text-amber">
              <Clock3 className="size-4" aria-hidden /> {b.statusLabel} — we&apos;ll confirm it on WhatsApp
            </p>
          </div>

          <dl className="mt-6 space-y-1.5 rounded-2xl bg-sage-50 p-4 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-ink-soft">Delivery</dt><dd className="text-right font-medium text-ink">{dayLabel(b.deliveryDate, b.deliveryDate).date}, {b.slotLabel}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-soft">Items</dt><dd className="font-medium text-ink">{b.items.length}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-soft">Subtotal</dt><dd className="tabular-nums">{formatINR(b.subtotal)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-soft">Delivery charges</dt><dd className="tabular-nums">{b.deliveryFee ? formatINR(b.deliveryFee) : "Free"}</dd></div>
            <div className="flex justify-between gap-3 border-t border-line pt-2 text-base"><dt className="font-semibold text-ink">Total amount</dt><dd className="font-bold tabular-nums text-forest-800">{formatINR(b.total)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-soft">Payment</dt><dd className="font-medium text-ink">{BOOKING_PAYMENT_LABEL[b.paymentMethod]}</dd></div>
          </dl>

          {b.paymentMethod === "upi_qr" && result.upiLink ? (
            <div className="mt-5 rounded-2xl border border-line p-4 text-center">
              <p className="font-semibold text-ink">Pay {formatINR(b.total)} by UPI</p>
              <UpiQr value={result.upiLink} className="mx-auto mt-3 size-52" />
              <a href={result.upiLink} className="mt-3 inline-flex h-11 items-center gap-2 rounded-full bg-forest-800 px-5 text-sm font-semibold text-white hover:bg-forest-900">
                <QrCode className="size-4" aria-hidden /> Pay with a UPI app
              </a>
              <p className="mt-2 text-xs text-muted">After paying, send the UPI transaction ID on WhatsApp. Your booking shows as paid once we check the payment.</p>
            </div>
          ) : null}
          {b.paymentMethod === "razorpay_link" ? (
            <div className="mt-5 rounded-2xl border border-line p-4 text-center">
              {b.paymentLinkUrl ? (
                <>
                  <a href={b.paymentLinkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-full bg-forest-800 px-5 text-sm font-semibold text-white hover:bg-forest-900">
                    <CreditCard className="size-4" aria-hidden /> Pay {formatINR(b.total)} securely online
                  </a>
                  <p className="mt-2 text-xs text-muted">Secure Razorpay page. Your booking is marked paid only after Razorpay confirms the payment.</p>
                </>
              ) : (
                <p className="text-sm text-ink-soft">We&apos;ll send your payment link on WhatsApp.</p>
              )}
            </div>
          ) : null}
          {b.paymentMethod === "cod" ? (
            <p className="mt-5 rounded-2xl border border-line p-4 text-center text-sm text-ink-soft">Pay {formatINR(b.total)} in cash when your order arrives.</p>
          ) : null}

          <div className="mt-6 flex flex-col gap-3">
            <a href={result.whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-whatsapp-dark px-5 font-semibold text-white hover:bg-forest-800">
              <WhatsAppIcon className="size-5" /> Open WhatsApp again
            </a>
            <Button variant="outline" size="lg" className="rounded-xl" onClick={finish}>
              <CheckCircle2 className="size-5 text-leaf-600" aria-hidden /> I&apos;ve sent it — clear my cart
            </Button>
          </div>
          <p className="mt-5 text-center text-xs text-muted">Didn&apos;t open? Make sure WhatsApp is installed, or use WhatsApp Web on a computer.</p>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="container-page py-10">
        <EmptyState icon={<ShoppingBasket className="size-7" />} title="Your cart is empty" action={<ButtonLink href="/shop">Start shopping</ButtonLink>}>
          Choose vegetables and fruits first, then book them on WhatsApp.
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
            <li key={l.variantId} className="py-2.5 text-sm">
              <div className="grid grid-cols-[minmax(0,1fr)_2.75rem_4.25rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_4.5rem_3.5rem_4.5rem]">
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
              </div>
              {itemMessages[l.variantId] || data?.messages[l.variantId] ? (
                <p className="mt-1 text-xs text-danger" role="alert">{itemMessages[l.variantId] ?? data?.messages[l.variantId]}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="container-page pt-6 md:pt-8">
      {!whatsappNumber ? (
        <Notice tone="warning" className="mb-5" title="WhatsApp booking isn't set up yet">
          The store owner needs to add a WhatsApp number. You can still place your order with{" "}
          <Link href="/checkout" className="font-semibold underline">Proceed to Checkout</Link>.
        </Notice>
      ) : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_30rem]">
        <form onSubmit={submit} noValidate className="min-w-0 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-7" aria-labelledby="details-title">
          <div className="flex items-center gap-4">
            <WhatsAppIcon className="size-12 shrink-0 text-whatsapp-dark" />
            <div>
              <h2 id="details-title" className="text-2xl font-bold text-forest-800">WhatsApp par book karein</h2>
              <p className="text-ink-soft">Fill in your details, choose a delivery slot and confirm your booking on WhatsApp.</p>
            </div>
          </div>

          {/* Honeypot: hidden from people, bots fill it in. */}
          <div aria-hidden className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
            <label htmlFor="wa-website">Website</label>
            <input id="wa-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>

          <div className="mt-6">
            <Step n={1} title="Customer Information" icon={<UserRound className="size-5 text-forest-800" aria-hidden />}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <IconInput id="wa-name" label="Full Name" required icon={<UserRound className="size-[1.1rem]" />} placeholder="Enter your full name" autoComplete="name" maxLength={80} value={form.name} onChange={set("name")} error={errors.name} />
                <IconInput id="wa-phone" label="Mobile Number" required icon={<Phone className="size-[1.1rem]" />} placeholder="10-digit mobile number" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={16} value={form.phone} onChange={set("phone")} error={errors.phone} />
              </div>
            </Step>

            <Step n={2} title="Delivery Address" icon={<MapPin className="size-5 text-forest-800" aria-hidden />}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <IconInput id="wa-address" className="sm:col-span-2" label="Full Address" required icon={<Home className="size-[1.1rem]" />} placeholder="House no., street, landmark" autoComplete="street-address" maxLength={200} value={form.address} onChange={set("address")} error={errors.address} />
                <IconInput id="wa-area" className="sm:col-span-2" label="Area / Sector" icon={<MapPin className="size-[1.1rem]" />} placeholder="e.g. Sector 7" maxLength={80} value={form.area} onChange={set("area")} error={errors.area} />
                <IconInput id="wa-city" label="City" required icon={<Building2 className="size-[1.1rem]" />} autoComplete="address-level2" maxLength={60} value={form.city} onChange={set("city")} error={errors.city} />
                <IconInput
                  id="wa-pincode" label="PIN Code" required icon={<MapPin className="size-[1.1rem]" />} inputMode="numeric" autoComplete="postal-code"
                  maxLength={6} placeholder="6-digit PIN code" value={form.pincode} onChange={set("pincode")} error={errors.pincode}
                  hint={
                    !pinValid ? "Used to work out delivery charges"
                      : loading ? "Checking delivery…"
                      : area ? <span className="text-leaf-600">Delivery to {area.areaName}: {area.fee ? formatINR(area.fee) : "free"}{area.freeAbove !== null ? `, free above ${formatINR(area.freeAbove)}` : ""}</span>
                      : <span className="text-danger">Sorry, we don&apos;t deliver to this PIN code yet</span>
                  }
                />
              </div>
            </Step>

            <Step n={3} title="Delivery date & slot" icon={<CalendarClock className="size-5 text-forest-800" aria-hidden />}>
              {slotsError ? <Notice tone="error">{slotsError}</Notice> : !slots ? (
                <div className="skeleton h-28" aria-busy="true" />
              ) : slots.length === 0 ? (
                <Notice tone="warning">No delivery slots are available right now. Please check back later.</Notice>
              ) : (
                <div className="space-y-3">
                  <div role="tablist" aria-label="Delivery date" className="no-scrollbar flex gap-2 overflow-x-auto">
                    {dates.map((d) => {
                      const l = dayLabel(d, dates[0]!);
                      const any = slots.some((s) => s.date === d && s.available);
                      return (
                        <button
                          key={d} type="button" role="tab" aria-selected={date === d}
                          onClick={() => { setDate(d); setSlotId(slots.find((s) => s.date === d && s.available)?.slotId ?? null); }}
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
                        <input type="radio" name="slot" className="sr-only" disabled={!s.available} checked={slotId === s.slotId} onChange={() => setSlotId(s.slotId)} />
                        <span className="block font-semibold text-ink">{s.label}</span>
                        <span className="block tabular-nums text-ink-soft">{formatSlotTime(s.startTime)} – {formatSlotTime(s.endTime)}</span>
                        {!s.available ? <span className="text-xs">Full / closed</span> : null}
                      </label>
                    ))}
                  </div>
                  {itemMessages._slot ? <p className="text-sm text-danger" role="alert">{itemMessages._slot}</p> : null}
                </div>
              )}
            </Step>

            <Step n={4} title="Payment method" icon={<CreditCard className="size-5 text-forest-800" aria-hidden />}>
              {paymentMethods.length === 0 ? (
                <Notice tone="warning">No payment method is set up yet. Please contact the store.</Notice>
              ) : (
                <div role="radiogroup" aria-label="Payment method" className="grid gap-2.5">
                  {paymentMethods.map((m) => (
                    <label key={m} className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border-2 p-3.5 text-sm transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lime-200", method === m ? "border-leaf-500 bg-lime-50" : "border-line hover:border-forest-700/30")}>
                      <input type="radio" name="pay" className="sr-only" checked={method === m} onChange={() => setMethod(m)} />
                      <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", method === m ? "bg-forest-800 text-white" : "bg-sage-100 text-forest-800")}>{PAYMENT_INFO[m].icon}</span>
                      <span>
                        <span className="block font-semibold text-ink">{BOOKING_PAYMENT_LABEL[m]}</span>
                        <span className="block text-ink-soft">{PAYMENT_INFO[m].text}</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </Step>

            <Step n={5} title="Delivery instructions" optional>
              <div className="relative">
                <label htmlFor="wa-notes" className="sr-only">Delivery instructions</label>
                <NotebookPen className="pointer-events-none absolute left-3.5 top-3.5 size-[1.1rem] text-ink-soft" aria-hidden />
                <textarea
                  id="wa-notes" value={form.notes} onChange={set("notes")} maxLength={200} rows={3}
                  placeholder="e.g. Call before coming, leave at the gate"
                  aria-invalid={errors.notes ? true : undefined}
                  className="w-full rounded-xl border border-line bg-white py-3 pl-11 pr-3.5 text-[0.9375rem] placeholder:text-muted/70 focus:border-leaf-600 focus:outline-none focus:ring-4 focus:ring-lime-200/70"
                />
                <span className="absolute bottom-2 right-3 text-xs text-muted" aria-live="polite">{form.notes.length}/200</span>
              </div>
            </Step>
          </div>

          <div className="mt-6 space-y-4">
            <Checkbox label="Remember my details on this device" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            {formError ? <Notice tone="error">{formError}</Notice> : null}
            {quoteError ? <Notice tone="error">{quoteError}</Notice> : null}
            <Button type="submit" size="lg" className="w-full rounded-xl bg-whatsapp-dark text-lg hover:bg-forest-800" loading={submitting} disabled={!whatsappNumber || loading || !quote || submitting}>
              {!submitting ? <WhatsAppIcon className="size-6" /> : null} Confirm Booking on WhatsApp
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-center text-sm text-leaf-600">
              <ShieldCheck className="size-4" aria-hidden /> Your booking is saved first, then WhatsApp opens. We confirm it after you send the message.
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
            {couponCode ? <Notice tone="info">Coupon {couponCode} applies at website checkout only, not on WhatsApp bookings.</Notice> : null}
            {data?.messages._cart && area ? <Notice tone="warning">{data.messages._cart}</Notice> : null}
            <div className="flex items-start gap-3 rounded-xl bg-sage-50 p-3.5 text-sm text-ink-soft">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-whatsapp text-white"><WhatsAppIcon className="size-6" /></span>
              <p>We save your booking with a Booking ID, then WhatsApp opens with all details. Press <b>Send</b> — the shop confirms your booking on WhatsApp.</p>
            </div>
          </OrderSummary>
          <p className="px-1 text-xs leading-relaxed text-muted">
            Prices and delivery charges come from our live price list and are checked again on our server when you book.
          </p>
        </aside>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, Home, MapPin, NotebookPen, Pencil, Phone, ShieldCheck, ShoppingBasket, UserRound } from "lucide-react";
import {
  buildWhatsAppOrderUrl, formatINR, isValidPincode, makeOrderReference, whatsappCustomerSchema,
  type QuoteIssue, type WhatsAppCustomerInput, type WhatsAppOrder,
} from "@freshbasket/shared";
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

const BLOCKING: QuoteIssue["code"][] = ["OUT_OF_STOCK", "UNAVAILABLE", "INVALID_QUANTITY", "EMPTY_CART", "TOO_MANY_LINES", "BELOW_MIN_ORDER"];

type Form = Required<Pick<WhatsAppCustomerInput, "name" | "phone" | "address" | "city" | "pincode">> & { area: string; notes: string };

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

export function WhatsAppOrderView({ whatsappNumber, storeName, defaultCity }: { whatsappNumber: string | null; storeName: string; defaultCity: string }) {
  const router = useRouter();
  const toast = useToast();
  const cart = useCart();
  const { lines, hydrated, couponCode } = cart;
  const [form, setForm] = useState<Form>({ name: "", phone: "", address: "", area: "", city: defaultCity, pincode: "", notes: "" });
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ url: string; reference: string } | null>(null);

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
  // Show and send items in the order the customer added them.
  const orderedLines = useMemo(() => {
    const pos = new Map(lines.map((l, i) => [l.variantId, i]));
    return [...(quote?.lines ?? [])].sort((a, b) => (pos.get(a.variantId) ?? 0) - (pos.get(b.variantId) ?? 0));
  }, [quote, lines]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = k === "pincode" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value;
    setForm((f) => ({ ...f, [k]: value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: "" }));
  };

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
    if (blocking.length) return setFormError("Some items in your cart need attention before you can order.");

    const order: WhatsAppOrder = {
      storeName,
      reference: makeOrderReference(),
      customer: parsed.data,
      lines: orderedLines.map((l) => ({ name: l.productName, variantLabel: l.variantLabel, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal })),
      subtotal: quote.subtotal,
      discount: quote.discount,
      couponCode: quote.couponCode,
      deliveryFee: area ? quote.deliveryFee : null,
      total: area ? quote.total : quote.subtotal - quote.discount,
    };
    let url: string;
    try {
      url = buildWhatsAppOrderUrl(whatsappNumber, order);
    } catch (err) {
      return setFormError((err as Error).message);
    }
    saveCustomer(remember ? parsed.data : null);
    // Must happen synchronously inside the click so pop-up blockers allow it.
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win) window.location.href = url;
    setSent({ url, reference: order.reference });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!hydrated) {
    return (
      <div className="container-page grid gap-6 pt-8 lg:grid-cols-[minmax(0,1fr)_28rem]" aria-busy="true">
        <div className="skeleton h-[32rem]" />
        <div className="skeleton h-96" />
      </div>
    );
  }

  if (sent) {
    return (
      <div className="container-page py-10">
        <div className="mx-auto max-w-xl rounded-[var(--radius-card)] border border-line bg-white p-6 text-center shadow-[var(--shadow-card)] sm:p-8" role="status">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-whatsapp text-white"><WhatsAppIcon className="size-9" /></span>
          <h2 className="mt-4 text-2xl font-bold text-forest-800">Almost done — tap Send in WhatsApp</h2>
          <p className="mt-2 text-ink-soft">
            WhatsApp has opened with your order <b className="text-ink">{sent.reference}</b>. Your order reaches us only after you press <b>Send</b> there.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <a href={sent.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-whatsapp-dark px-5 font-semibold text-white hover:bg-forest-800">
              <WhatsAppIcon className="size-5" /> Open WhatsApp again
            </a>
            <Button
              variant="outline"
              size="lg"
              className="rounded-xl"
              onClick={() => {
                cart.clear();
                toast("Thanks! Your cart has been cleared.");
                router.push("/");
              }}
            >
              <CheckCircle2 className="size-5 text-leaf-600" aria-hidden /> I&apos;ve sent it — clear my cart
            </Button>
            <button type="button" onClick={() => setSent(null)} className="text-sm font-semibold text-forest-800 hover:underline">
              Edit my details
            </button>
          </div>
          <p className="mt-5 text-xs text-muted">Didn&apos;t open? Make sure WhatsApp is installed, or use WhatsApp Web on a computer.</p>
        </div>
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
                    : <span className="text-amber">Not in our delivery list yet — the seller will confirm on WhatsApp</span>
                }
              />
            </div>
          </fieldset></div>

          <div className="mt-7 border-t border-line pt-6"><fieldset>
            <legend className="flex items-center gap-3 text-lg font-semibold text-ink"><span className="grid size-8 place-items-center rounded-full bg-forest-800 text-sm font-bold text-white">3</span> Order Notes <span className="text-sm font-normal text-muted">(Optional)</span></legend>
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

          <div className="mt-6 space-y-4">
            <Checkbox label="Remember my details on this device" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            {formError ? <Notice tone="error">{formError}</Notice> : null}
            {quoteError ? <Notice tone="error">{quoteError}</Notice> : null}
            <Button type="submit" size="lg" className="w-full rounded-xl text-lg" disabled={!whatsappNumber || loading || !quote}>
              <WhatsAppIcon className="size-6" /> Proceed to WhatsApp
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-center text-sm text-leaf-600">
              <ShieldCheck className="size-4" aria-hidden /> Your order details will be sent to WhatsApp for confirmation.
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
              <p>After you tap the button, WhatsApp opens with your order details. Simply press <b>Send</b> to confirm with us.</p>
            </div>
          </OrderSummary>
          <p className="px-1 text-xs leading-relaxed text-muted">
            Prices come from our live price list. The seller confirms availability and the final amount on WhatsApp before delivery.
          </p>
        </aside>
      </div>
    </div>
  );
}

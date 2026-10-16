"use client";

import { useRef, useState } from "react";
import { CheckCircle2, CircleDashed, ImagePlus, Save, X, FlaskConical } from "lucide-react";
import { adminSettingsSchema, type StoreSettings } from "@freshbasket/shared";
import { api } from "@/lib/client/api";
import { Button } from "../ui/button";
import { Field, Input, Textarea } from "../ui/form";
import { Notice } from "../ui/feedback";
import { useToast } from "../ui/toast";
import { cn } from "../ui/cn";
import { errorMessage, serverFieldErrors, uploadImage, useAdminData } from "./use-admin-data";
import { AdminOnly } from "./admin-context";
import { inputToPaise, paiseToInput } from "./money";
import { Card, CardHeader, LoadError, LoadingRows, MoneyInput, PageHeader, Toggle } from "./ui";

interface Services {
  auth: "supabase" | "dev" | "unconfigured";
  storage: "supabase" | "local" | "none";
  payments: "razorpay" | "mock" | null;
  razorpayKeyIdSet: boolean;
  webhookSecretSet: boolean;
  cronSecretSet: boolean;
  whatsappCloud?: boolean;
  whatsappTemplates?: string[];
}

export function SettingsForm() {
  return (
    <AdminOnly>
      <Loader />
    </AdminOnly>
  );
}

function Loader() {
  const { data, error, reload } = useAdminData<{ settings: StoreSettings; services: Services }>("/api/admin/settings");
  return (
    <>
      <PageHeader title="Settings" description="Store details shown to customers, ordering rules, and the status of connected services." />
      {error && !data ? <LoadError message={error} onRetry={reload} /> : !data ? <LoadingRows rows={6} /> : (
        <div className="grid gap-6 xl:grid-cols-[1fr_24rem] xl:items-start">
          <Editor initial={data.settings} />
          <ServicesPanel s={data.services} />
        </div>
      )}
    </>
  );
}

function Editor({ initial }: { initial: StoreSettings }) {
  const toast = useToast();
  const [f, setF] = useState({
    storeName: initial.storeName,
    tagline: initial.tagline ?? "",
    logoUrl: initial.logoUrl,
    supportPhone: initial.supportPhone ?? "",
    supportEmail: initial.supportEmail ?? "",
    whatsapp: initial.whatsapp ?? "",
    address: initial.address ?? "",
    supportHours: initial.supportHours ?? "",
    instagram: initial.social.instagram ?? "",
    facebook: initial.social.facebook ?? "",
    youtube: initial.social.youtube ?? "",
    x: initial.social.x ?? "",
    codEnabled: initial.codEnabled,
    defaultMinOrder: paiseToInput(initial.defaultMinOrder),
    slotDaysAhead: String(initial.slotDaysAhead),
    announcement: initial.announcement ?? "",
    upiId: initial.upiId ?? "",
    upiPayeeName: initial.upiPayeeName ?? "",
    upiQrUrl: initial.upiQrUrl,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qrRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<typeof f>) => {
    setF((x) => ({ ...x, ...p }));
    setSaved(false);
  };

  async function onLogo(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      set({ logoUrl: await uploadImage(file) });
    } catch (e) {
      setFormError(errorMessage(e, "Upload failed."));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onQr(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      set({ upiQrUrl: await uploadImage(file) });
    } catch (e) {
      setFormError(errorMessage(e, "Upload failed."));
    } finally {
      setUploading(false);
      if (qrRef.current) qrRef.current.value = "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errs: Record<string, string> = {};
    const minOrder = inputToPaise(f.defaultMinOrder);
    if (minOrder === null || Number.isNaN(minOrder)) errs.defaultMinOrder = "Enter an amount (0 for none)";
    const days = /^\d+$/.test(f.slotDaysAhead) ? Number(f.slotDaysAhead) : -1;
    const r = adminSettingsSchema.safeParse({
      ...f,
      logoUrl: f.logoUrl || null,
      supportPhone: f.supportPhone.trim() || null,
      supportEmail: f.supportEmail.trim(),
      whatsapp: f.whatsapp.trim() || null,
      address: f.address.trim() || null,
      supportHours: f.supportHours.trim() || null,
      announcement: f.announcement.trim() || null,
      upiId: f.upiId.trim(),
      upiPayeeName: f.upiPayeeName.trim() || null,
      upiQrUrl: f.upiQrUrl || null,
      defaultMinOrder: minOrder === null || Number.isNaN(minOrder) ? 0 : minOrder,
      slotDaysAhead: days,
    });
    if (!r.success) {
      for (const i of r.error.issues) {
        const k = String(i.path[0]);
        errs[k] ??= k === "storeName" ? "Enter the store name (2–60 characters)" : k === "supportEmail" ? "Enter a valid email or leave empty" : k === "slotDaysAhead" ? "Between 1 and 14 days" : i.message;
      }
    }
    setErrors(errs);
    if (!r.success || Object.keys(errs).length) {
      setFormError("Please fix the highlighted fields.");
      return;
    }
    setSaving(true);
    try {
      await api("/api/admin/settings", { method: "PUT", json: r.data });
      toast("Settings saved");
      setSaved(true);
    } catch (err) {
      setErrors(serverFieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const text = (key: keyof typeof f, label: string, opts: { hint?: string; type?: string; placeholder?: string; max?: number; className?: string; inputMode?: "tel" | "email" | "url" } = {}) => (
    <Field label={label} htmlFor={`st-${key}`} error={errors[key]} hint={opts.hint} className={opts.className}>
      <Input
        id={`st-${key}`}
        type={opts.type ?? "text"}
        inputMode={opts.inputMode}
        value={f[key] as string}
        maxLength={opts.max}
        placeholder={opts.placeholder}
        invalid={!!errors[key]}
        onChange={(e) => set({ [key]: e.target.value } as Partial<typeof f>)}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      {formError ? <Notice tone="error">{formError}</Notice> : null}

      <Card aria-labelledby="brand-h">
        <CardHeader id="brand-h" title="Brand" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          {text("storeName", "Store name", { max: 60 })}
          {text("tagline", "Tagline", { max: 120, placeholder: "Your everyday vegetables, just a tap away." })}
          <div className="sm:col-span-2">
            <p className="text-sm font-medium text-ink-soft">Logo</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <div className="grid h-16 min-w-28 place-items-center rounded-xl border border-line bg-ivory px-3">
                {f.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- preview of an uploaded logo of unknown size
                  <img src={f.logoUrl} alt="Store logo preview" className="max-h-12 w-auto" />
                ) : (
                  <span className="text-xs text-muted">Using store name</span>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="st-logo" onChange={(e) => onLogo(e.target.files?.[0])} />
              <Button type="button" size="sm" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
                {!uploading ? <ImagePlus className="size-4" aria-hidden /> : null} {f.logoUrl ? "Replace logo" : "Upload logo"}
              </Button>
              {f.logoUrl ? <Button type="button" size="sm" variant="ghost" onClick={() => set({ logoUrl: null })}><X className="size-4" aria-hidden /> Remove</Button> : null}
            </div>
            <p className="mt-1.5 text-[0.8125rem] text-muted">PNG with a transparent background works best. Without a logo, the store name is shown in the brand typeface.</p>
          </div>
          <Field label="Announcement bar" htmlFor="st-announcement" error={errors.announcement} hint={`${f.announcement.length}/160 · Leave empty to hide the bar`} className="sm:col-span-2">
            <Input id="st-announcement" value={f.announcement} maxLength={160} onChange={(e) => set({ announcement: e.target.value })} placeholder="Free delivery on orders above ₹499 this week!" />
          </Field>
        </div>
      </Card>

      <Card aria-labelledby="support-h">
        <CardHeader id="support-h" title="Customer support" description="Shown in the footer and on the contact page." />
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          {text("supportPhone", "Phone", { type: "tel", inputMode: "tel", max: 20, placeholder: "+91 98765 43210" })}
          {text("whatsapp", "WhatsApp number", { type: "tel", inputMode: "tel", max: 20, placeholder: "919876543210", hint: "With country code, digits only" })}
          {text("supportEmail", "Email", { type: "email", inputMode: "email", placeholder: "hello@yourstore.in" })}
          {text("supportHours", "Support hours", { max: 120, placeholder: "7 AM – 9 PM, every day" })}
          <Field label="Address" htmlFor="st-address" error={errors.address} className="sm:col-span-2">
            <Textarea id="st-address" value={f.address} maxLength={300} className="min-h-20" onChange={(e) => set({ address: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card aria-labelledby="social-h">
        <CardHeader id="social-h" title="Social links" description="Full https:// links. Leave empty to hide." />
        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          {text("instagram", "Instagram", { type: "url", inputMode: "url", placeholder: "https://instagram.com/…" })}
          {text("facebook", "Facebook", { type: "url", inputMode: "url", placeholder: "https://facebook.com/…" })}
          {text("youtube", "YouTube", { type: "url", inputMode: "url", placeholder: "https://youtube.com/@…" })}
          {text("x", "X (Twitter)", { type: "url", inputMode: "url", placeholder: "https://x.com/…" })}
        </div>
      </Card>

      <Card aria-labelledby="ordering-h">
        <CardHeader id="ordering-h" title="Ordering" />
        <div className="space-y-5 p-5 sm:p-6">
          <Toggle checked={f.codEnabled} onChange={(v) => set({ codEnabled: v })} label="Cash on delivery" description="Let customers pay in cash when the order arrives." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default minimum order" htmlFor="st-min" error={errors.defaultMinOrder} hint="Used where a delivery area has no minimum of its own">
              <MoneyInput id="st-min" value={f.defaultMinOrder} invalid={!!errors.defaultMinOrder} onChange={(e) => set({ defaultMinOrder: e.target.value })} />
            </Field>
            <Field label="Days of slots to show" htmlFor="st-days" error={errors.slotDaysAhead} hint="How far ahead customers can book (1–14)">
              <Input id="st-days" inputMode="numeric" value={f.slotDaysAhead} invalid={!!errors.slotDaysAhead} onChange={(e) => set({ slotDaysAhead: e.target.value.replace(/[^\d]/g, "") })} />
            </Field>
          </div>
        </div>
      </Card>

      <Card aria-labelledby="upi-h">
        <CardHeader
          id="upi-h"
          title="UPI payments"
          description="Customers can pay to this UPI ID at checkout and on WhatsApp orders. Each UPI order stays “payment pending” until you confirm the money arrived (Orders → order → Verify UPI payment). Leave the UPI ID empty to turn UPI off."
        />
        <div className="space-y-4 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="UPI ID" htmlFor="st-upi" error={errors.upiId} hint="e.g. yourname@okaxis — the account that receives the money">
              <Input id="st-upi" value={f.upiId} invalid={!!errors.upiId} autoComplete="off" onChange={(e) => set({ upiId: e.target.value })} maxLength={120} />
            </Field>
            <Field label="Payee name (optional)" htmlFor="st-upi-name" hint="Shown in the customer's UPI app">
              <Input id="st-upi-name" value={f.upiPayeeName} onChange={(e) => set({ upiPayeeName: e.target.value })} maxLength={60} />
            </Field>
          </div>
          <div>
            <p className="text-sm font-medium text-ink-soft">Your UPI QR image (optional)</p>
            <p className="text-xs text-muted">We also show a QR made from the UPI ID with the exact order amount. Upload your bank/UPI app QR if you want customers to see it too.</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {f.upiQrUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded image
                <img src={f.upiQrUrl} alt="UPI QR preview" className="h-28 w-28 rounded-lg border border-line bg-white object-contain p-1" />
              ) : null}
              <input ref={qrRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="st-upi-qr" onChange={(e) => onQr(e.target.files?.[0])} />
              <Button type="button" size="sm" variant="outline" loading={uploading} onClick={() => qrRef.current?.click()}>
                {!uploading ? <ImagePlus className="size-4" aria-hidden /> : null} {f.upiQrUrl ? "Replace QR" : "Upload QR"}
              </Button>
              {f.upiQrUrl ? <Button type="button" size="sm" variant="ghost" onClick={() => set({ upiQrUrl: null })}><X className="size-4" aria-hidden /> Remove</Button> : null}
            </div>
          </div>
        </div>
      </Card>

      <div className="sticky bottom-4 z-20 flex items-center justify-end gap-3 rounded-full border border-line bg-white/95 py-2 pl-5 pr-2 shadow-[var(--shadow-lift)] backdrop-blur">
        {saved ? <span className="mr-auto inline-flex items-center gap-1.5 text-sm text-forest-700" role="status"><CheckCircle2 className="size-4" aria-hidden /> All changes saved</span> : null}
        <Button type="submit" loading={saving} disabled={uploading}>{!saving ? <Save className="size-4" aria-hidden /> : null} Save settings</Button>
      </div>
    </form>
  );
}

function ServiceRow({ ok, test, title, status, children }: { ok: boolean; test?: boolean; title: string; status: string; children: React.ReactNode }) {
  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", ok ? "bg-lime-100 text-forest-700" : test ? "bg-[#fdf6e7] text-[#7a5212]" : "bg-sage-100 text-muted")}>
          {ok ? <CheckCircle2 className="size-4" aria-hidden /> : test ? <FlaskConical className="size-4" aria-hidden /> : <CircleDashed className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className={cn("text-sm font-medium", ok ? "text-forest-700" : test ? "text-[#7a5212]" : "text-muted")}>{status}</p>
          <div className="mt-1.5 text-[0.8125rem] leading-relaxed text-muted">{children}</div>
        </div>
      </div>
    </li>
  );
}

const Env = ({ children }: { children: string }) => <code className="rounded bg-sage-100 px-1 py-0.5 text-[0.75rem] text-ink-soft">{children}</code>;

function ServicesPanel({ s }: { s: Services }) {
  return (
    <Card aria-labelledby="services-h" className="xl:sticky xl:top-6">
      <CardHeader id="services-h" title="Services" description="Read-only. These are set with server environment variables, not here." />
      <ul className="divide-y divide-line">
        <ServiceRow ok={s.auth === "supabase"} test={s.auth === "dev"} title="Sign-in" status={s.auth === "supabase" ? "Live — Supabase Auth" : s.auth === "dev" ? "Development login (not for real customers)" : "Not configured — nobody can sign in"}>
          Real customer sign-in needs <Env>NEXT_PUBLIC_SUPABASE_URL</Env> and <Env>NEXT_PUBLIC_SUPABASE_ANON_KEY</Env> from your Supabase project.
        </ServiceRow>
        <ServiceRow ok={s.storage === "supabase"} test={s.storage === "local"} title="Photo storage" status={s.storage === "supabase" ? "Live — Supabase Storage" : s.storage === "local" ? "Saved on this machine (development only)" : "Not configured — uploads are disabled"}>
          Uploads go to Supabase Storage when <Env>SUPABASE_SERVICE_ROLE_KEY</Env> is set as well (keep it secret — server only).
        </ServiceRow>
        <ServiceRow ok={s.payments === "razorpay"} test={s.payments === "mock"} title="Online payments" status={s.payments === "razorpay" ? "Live — Razorpay" : s.payments === "mock" ? "Test payments — no real money moves" : "Off — cash on delivery only"}>
          Razorpay goes live only when <Env>RAZORPAY_KEY_ID</Env>, <Env>RAZORPAY_KEY_SECRET</Env> and <Env>RAZORPAY_WEBHOOK_SECRET</Env> are all set.
          <ul className="mt-2 space-y-0.5">
            <li>Key ID: {s.razorpayKeyIdSet ? "set" : "not set"}</li>
            <li>Webhook secret: {s.webhookSecretSet ? "set" : "not set"}</li>
          </ul>
        </ServiceRow>
        <ServiceRow ok={Boolean(s.whatsappCloud && s.whatsappTemplates?.length)} title="WhatsApp order updates" status={s.whatsappCloud ? `WhatsApp Cloud API connected · ${s.whatsappTemplates?.length ?? 0} of 4 templates set` : "Off — no automatic WhatsApp messages"}>
          Set <Env>WHATSAPP_CLOUD_ACCESS_TOKEN</Env>, <Env>WHATSAPP_CLOUD_PHONE_NUMBER_ID</Env> and the approved template names (<Env>WHATSAPP_TEMPLATE_ORDER_CONFIRMED</Env> etc.). Only customers who opt in get messages.
        </ServiceRow>
        <ServiceRow ok={s.cronSecretSet} title="Scheduled clean-up" status={s.cronSecretSet ? "Cron secret set" : "Cron secret not set"}>
          Unpaid online orders release their stock after the payment window. Set <Env>CRON_SECRET</Env> so your scheduler can call the clean-up job; it also runs whenever staff open the dashboard or orders.
        </ServiceRow>
      </ul>
    </Card>
  );
}

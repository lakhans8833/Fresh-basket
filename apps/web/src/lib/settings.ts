import "server-only";
import { cache } from "react";
import { BRAND_NAME, type StoreSettings } from "@freshbasket/shared";
import { queryOne } from "./db";
import { env } from "./env";
import { resolveWhatsAppNumber } from "@/config/store";
import { CACHE_TAGS, cached } from "./cache";

type Row = {
  store_name: string; tagline: string; logo_url: string | null; support_phone: string | null; support_email: string | null;
  whatsapp: string | null; address: string | null; support_hours: string | null; instagram_url: string | null;
  facebook_url: string | null; youtube_url: string | null; x_url: string | null; cod_enabled: boolean;
  default_min_order: number; slot_days_ahead: number; announcement: string | null;
  upi_id?: string | null; upi_payee_name?: string | null; upi_qr_url?: string | null;
  legal_name?: string | null; legal_address?: string | null; legal_registration?: string | null; grievance_officer?: string | null;
  grievance_email?: string | null; legal_jurisdiction?: string | null; policies_updated?: Date | string | null;
};

const EMPTY_LEGAL = { name: null, address: null, registration: null, grievanceOfficer: null, grievanceEmail: null, jurisdiction: null, updated: null };
// node-postgres turns a `date` into a Date at LOCAL midnight; read it back with local getters so the day never shifts.
const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (v: Date | string | null | undefined) =>
  v == null ? null : v instanceof Date ? `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}` : String(v).slice(0, 10);

export const DEFAULT_SETTINGS: StoreSettings = {
  storeName: BRAND_NAME,
  tagline: "Your everyday vegetables, just a tap away.",
  logoUrl: null,
  supportPhone: null,
  supportEmail: null,
  whatsapp: null,
  address: null,
  supportHours: null,
  social: { instagram: null, facebook: null, youtube: null, x: null },
  codEnabled: true,
  onlinePayment: null,
  defaultMinOrder: 0,
  slotDaysAhead: 3,
  announcement: null,
  upiId: null,
  upiPayeeName: null,
  upiQrUrl: null,
  paymentLinks: false,
  legal: EMPTY_LEGAL,
};

export const getSettings = cache(async (): Promise<StoreSettings> => {
  let base: StoreSettings = DEFAULT_SETTINGS;
  try {
    base = (await loadSettings()) ?? DEFAULT_SETTINGS;
  } catch (e) {
    // Database not reachable or not migrated yet: keep the shell rendering with defaults (not cached).
    console.error("[settings] could not load store settings — see /api/health", e);
  }
  return { ...base, onlinePayment: env.payments.online, paymentLinks: env.payments.online === "razorpay" };
});

/** Store settings row, cached across requests (dropped when Admin → Settings is saved). Throws on DB errors. */
const loadSettings = cached("settings-v2", [CACHE_TAGS.settings], 600, async (): Promise<StoreSettings | null> => {
  const r = await queryOne<Row>("select * from store_settings where id");
  if (!r) return null;
  return {
    ...DEFAULT_SETTINGS,
    storeName: r.store_name,
    tagline: r.tagline,
    logoUrl: r.logo_url,
    supportPhone: r.support_phone,
    supportEmail: r.support_email,
    whatsapp: r.whatsapp,
    address: r.address,
    supportHours: r.support_hours,
    social: { instagram: r.instagram_url, facebook: r.facebook_url, youtube: r.youtube_url, x: r.x_url },
    codEnabled: r.cod_enabled,
    defaultMinOrder: r.default_min_order,
    slotDaysAhead: r.slot_days_ahead,
    announcement: r.announcement,
    upiId: r.upi_id ?? null,
    upiPayeeName: r.upi_payee_name ?? null,
    upiQrUrl: r.upi_qr_url ?? null,
    legal: {
      name: r.legal_name ?? null,
      address: r.legal_address ?? null,
      registration: r.legal_registration ?? null,
      grievanceOfficer: r.grievance_officer ?? null,
      grievanceEmail: r.grievance_email ?? null,
      jurisdiction: r.legal_jurisdiction ?? null,
      updated: isoDay(r.policies_updated),
    },
  };
});

/** Payment methods that can actually be used at website checkout right now — the only ones shown there. */
export function supportedPaymentMethods(s: StoreSettings): ("cod" | "razorpay" | "mock" | "upi")[] {
  const out: ("cod" | "razorpay" | "mock" | "upi")[] = [];
  if (s.onlinePayment) out.push(s.onlinePayment);
  if (s.upiId) out.push("upi");
  if (s.codEnabled) out.push("cod");
  return out;
}

/** Payment methods for "Order on WhatsApp": cash on delivery, UPI (checked by staff), Razorpay Payment Link. */
export function whatsappPaymentMethods(s: StoreSettings): ("cod" | "upi" | "razorpay_link")[] {
  const out: ("cod" | "upi" | "razorpay_link")[] = [];
  if (s.codEnabled) out.push("cod");
  if (s.upiId) out.push("upi");
  if (s.paymentLinks) out.push("razorpay_link");
  return out;
}

/** Business details the policy pages leave out until they're filled in (Admin → Settings → Legal & policies). */
export function legalGaps(s: StoreSettings): string[] {
  const l = s.legal;
  const gaps: string[] = [];
  if (!l.name) gaps.push("Registered business name");
  if (!l.address) gaps.push("Registered address");
  if (!l.grievanceOfficer || !l.grievanceEmail) gaps.push("Grievance officer name & email");
  if (!l.updated) gaps.push("Policies last-updated date");
  return gaps;
}

/** Customer-support details still empty in Admin → Settings (shown to staff as a setup notice; never invented). */
export function supportGaps(s: StoreSettings): string[] {
  const gaps: string[] = [];
  if (!s.supportPhone) gaps.push("Phone");
  if (!resolveWhatsAppNumber(s.whatsapp)) gaps.push("WhatsApp number");
  if (!s.supportEmail) gaps.push("Email");
  if (!s.supportHours) gaps.push("Support hours");
  return gaps;
}

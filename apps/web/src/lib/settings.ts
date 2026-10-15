import "server-only";
import { cache } from "react";
import type { StoreSettings } from "@freshbasket/shared";
import { queryOne } from "./db";
import { env } from "./env";
import { CACHE_TAGS, cached } from "./cache";

type Row = {
  store_name: string; tagline: string; logo_url: string | null; support_phone: string | null; support_email: string | null;
  whatsapp: string | null; address: string | null; support_hours: string | null; instagram_url: string | null;
  facebook_url: string | null; youtube_url: string | null; x_url: string | null; cod_enabled: boolean;
  default_min_order: number; slot_days_ahead: number; announcement: string | null;
  upi_id?: string | null; upi_payee_name?: string | null; upi_qr_url?: string | null;
};

export const DEFAULT_SETTINGS: StoreSettings = {
  storeName: "Fresh Basket",
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
const loadSettings = cached("settings-v1", [CACHE_TAGS.settings], 600, async (): Promise<StoreSettings | null> => {
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

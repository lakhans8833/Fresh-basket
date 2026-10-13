import "server-only";
import { cache } from "react";
import type { StoreSettings } from "@freshbasket/shared";
import { queryOne } from "./db";
import { env } from "./env";

type Row = {
  store_name: string; tagline: string; logo_url: string | null; support_phone: string | null; support_email: string | null;
  whatsapp: string | null; address: string | null; support_hours: string | null; instagram_url: string | null;
  facebook_url: string | null; youtube_url: string | null; x_url: string | null; cod_enabled: boolean;
  default_min_order: number; slot_days_ahead: number; announcement: string | null;
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
};

export const getSettings = cache(async (): Promise<StoreSettings> => {
  const r = await queryOne<Row>("select * from store_settings where id");
  const base = r
    ? {
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
      }
    : DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...base, onlinePayment: env.payments.online };
});

/** Payment methods that can actually be used right now — the only ones shown anywhere. */
export function supportedPaymentMethods(s: StoreSettings): ("cod" | "razorpay" | "mock")[] {
  const out: ("cod" | "razorpay" | "mock")[] = [];
  if (s.onlinePayment) out.push(s.onlinePayment);
  if (s.codEnabled) out.push("cod");
  return out;
}

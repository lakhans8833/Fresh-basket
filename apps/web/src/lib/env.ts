import "server-only";
import { createHmac } from "node:crypto";
import { envAlias } from "./env-alias";

/**
 * Central place for server configuration. Nothing in this file is sent to the browser.
 * Modes are derived from which credentials are present, so the app never pretends a
 * service is live when it is not.
 */
const isProd = process.env.NODE_ENV === "production";

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

// Supabase settings may carry a prefix from the Vercel integration (e.g. STORAGE_POSTGRES_URL).
const supabaseUrl = envAlias("NEXT_PUBLIC_SUPABASE_URL") ?? envAlias("SUPABASE_URL");
const supabaseAnonKey = envAlias("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? envAlias("SUPABASE_ANON_KEY");
const serviceRoleKey = envAlias("SUPABASE_SERVICE_ROLE_KEY");

/**
 * APP_SECRET signs the app's own tokens. If it isn't set, derive one from a server-only Supabase
 * secret (never sent to the browser) so a fresh Vercel project with only the Supabase integration
 * still works. Setting APP_SECRET explicitly is still recommended.
 */
function derivedSecret(): string | undefined {
  const base = envAlias("SUPABASE_JWT_SECRET") ?? serviceRoleKey;
  return base ? createHmac("sha256", base).update("fresh-basket:app-secret:v1").digest("hex") : undefined;
}
const razorpayKeyId = read("RAZORPAY_KEY_ID");
const razorpayKeySecret = read("RAZORPAY_KEY_SECRET");
const razorpayWebhookSecret = read("RAZORPAY_WEBHOOK_SECRET");

// Dev login, local uploads and the built-in dev secret: never on a Vercel production deployment, even
// if ALLOW_DEV_MODE=true is set there by mistake (it would let anyone sign in as admin).
const devFeaturesAllowed = (!isProd || read("ALLOW_DEV_MODE") === "true") && read("VERCEL_ENV") !== "production";

const DEV_APP_SECRET = "dev-only-insecure-secret-change-me-0123456789";

export const env = {
  isProd,
  // DATABASE_URL, or POSTGRES_URL as created by the Vercel ↔ Supabase integration.
  databaseUrl: read("DATABASE_URL") ?? envAlias("POSTGRES_URL") ?? "postgres://postgres:postgres@localhost:5432/freshbasket",
  appUrl: read("NEXT_PUBLIC_APP_URL") ?? (read("VERCEL_PROJECT_PRODUCTION_URL") ? `https://${read("VERCEL_PROJECT_PRODUCTION_URL")}` : "http://localhost:3000"),
  appSecret: read("APP_SECRET") ?? derivedSecret() ?? (devFeaturesAllowed ? DEV_APP_SECRET : undefined),

  auth: {
    mode: (supabaseUrl && supabaseAnonKey ? "supabase" : devFeaturesAllowed ? "dev" : "unconfigured") as
      | "supabase"
      | "dev"
      | "unconfigured",
    supabaseUrl,
    supabaseAnonKey,
  },

  storage: {
    mode: (supabaseUrl && serviceRoleKey ? "supabase" : devFeaturesAllowed ? "local" : "none") as
      | "supabase"
      | "local"
      | "none",
    serviceRoleKey,
    bucket: read("SUPABASE_STORAGE_BUCKET") ?? "product-images",
  },

  payments: {
    online: (razorpayKeyId && razorpayKeySecret && razorpayWebhookSecret
      ? "razorpay"
      : // Test payments never on a Vercel production deploy, even with ALLOW_DEV_MODE (they'd mark orders paid for free).
        devFeaturesAllowed && read("PAYMENTS_MOCK") !== "false" && read("VERCEL_ENV") !== "production"
        ? "mock"
        : null) as "razorpay" | "mock" | null,
    razorpayKeyId,
    razorpayKeySecret,
    razorpayWebhookSecret,
    reservationMinutes: Number(read("PAYMENT_RESERVATION_MINUTES") ?? 15),
  },

  /**
   * WhatsApp Business Platform (Cloud API) for automatic order updates. Server-only secrets.
   * Off unless the access token and phone number ID are set; each event also needs an approved
   * template name (see README → WhatsApp order updates).
   */
  whatsappCloud: {
    accessToken: read("WHATSAPP_CLOUD_ACCESS_TOKEN"),
    phoneNumberId: read("WHATSAPP_CLOUD_PHONE_NUMBER_ID"),
    apiVersion: read("WHATSAPP_CLOUD_API_VERSION") ?? "v21.0",
    apiBase: read("WHATSAPP_CLOUD_API_BASE") ?? "https://graph.facebook.com",
    language: read("WHATSAPP_TEMPLATE_LANGUAGE") ?? "en",
    templates: {
      confirmed: read("WHATSAPP_TEMPLATE_ORDER_CONFIRMED"),
      packed: read("WHATSAPP_TEMPLATE_ORDER_PACKED"),
      out_for_delivery: read("WHATSAPP_TEMPLATE_OUT_FOR_DELIVERY"),
      delivered: read("WHATSAPP_TEMPLATE_ORDER_DELIVERED"),
    },
  },

  /**
   * Outgoing email over SMTP (Nodemailer), e.g. Gmail with an app password, Zoho, Brevo or Amazon SES.
   * Server-only secrets. Account-verification codes go out this way when it is set up together with
   * Supabase Auth's service role key; otherwise Supabase sends its own confirmation emails (as before).
   */
  smtp: {
    host: read("SMTP_HOST"),
    port: Number(read("SMTP_PORT") ?? 587),
    /** TLS from the first byte (port 465). Port 587 upgrades with STARTTLS. */
    secure: read("SMTP_SECURE") ? read("SMTP_SECURE") === "true" : Number(read("SMTP_PORT") ?? 587) === 465,
    user: read("SMTP_USER"),
    pass: read("SMTP_PASS"),
    /** "Rams Fresh Basket <orders@example.com>"; defaults to SMTP_USER. */
    from: read("MAIL_FROM"),
  },

  cronSecret: read("CRON_SECRET"),
  devFeaturesAllowed,
};

/** Verification codes are emailed by this app (Nodemailer) instead of Supabase's own mailer. */
export function emailCodesBySmtp(): boolean {
  return Boolean(env.smtp.host && env.smtp.user && env.smtp.pass && env.auth.mode === "supabase" && env.storage.serviceRoleKey && env.appSecret);
}

export function requireAppSecret(): string {
  if (!env.appSecret) throw new Error("APP_SECRET is not configured");
  return env.appSecret;
}

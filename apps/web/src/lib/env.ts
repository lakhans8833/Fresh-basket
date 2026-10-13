import "server-only";

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

const supabaseUrl = read("NEXT_PUBLIC_SUPABASE_URL") ?? read("SUPABASE_URL");
const supabaseAnonKey = read("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const razorpayKeyId = read("RAZORPAY_KEY_ID");
const razorpayKeySecret = read("RAZORPAY_KEY_SECRET");
const razorpayWebhookSecret = read("RAZORPAY_WEBHOOK_SECRET");

const devFeaturesAllowed = !isProd || read("ALLOW_DEV_MODE") === "true";

const DEV_APP_SECRET = "dev-only-insecure-secret-change-me-0123456789";

export const env = {
  isProd,
  // DATABASE_URL, or POSTGRES_URL as created by the Vercel ↔ Supabase integration.
  databaseUrl: read("DATABASE_URL") ?? read("POSTGRES_URL") ?? "postgres://postgres:postgres@localhost:5432/freshbasket",
  appUrl: read("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",
  appSecret: read("APP_SECRET") ?? (devFeaturesAllowed ? DEV_APP_SECRET : undefined),

  auth: {
    mode: (supabaseUrl && supabaseAnonKey ? "supabase" : devFeaturesAllowed ? "dev" : "unconfigured") as
      | "supabase"
      | "dev"
      | "unconfigured",
    supabaseUrl,
    supabaseAnonKey,
  },

  storage: {
    mode: (supabaseUrl && read("SUPABASE_SERVICE_ROLE_KEY") ? "supabase" : devFeaturesAllowed ? "local" : "none") as
      | "supabase"
      | "local"
      | "none",
    serviceRoleKey: read("SUPABASE_SERVICE_ROLE_KEY"),
    bucket: read("SUPABASE_STORAGE_BUCKET") ?? "product-images",
  },

  payments: {
    online: (razorpayKeyId && razorpayKeySecret && razorpayWebhookSecret
      ? "razorpay"
      : devFeaturesAllowed && read("PAYMENTS_MOCK") !== "false"
        ? "mock"
        : null) as "razorpay" | "mock" | null,
    razorpayKeyId,
    razorpayKeySecret,
    razorpayWebhookSecret,
    reservationMinutes: Number(read("PAYMENT_RESERVATION_MINUTES") ?? 15),
  },

  cronSecret: read("CRON_SECRET"),
  devFeaturesAllowed,
};

export function requireAppSecret(): string {
  if (!env.appSecret) throw new Error("APP_SECRET is not configured");
  return env.appSecret;
}

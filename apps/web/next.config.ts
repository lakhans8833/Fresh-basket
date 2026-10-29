import type { NextConfig } from "next";
import { envAlias } from "./src/lib/env-alias";

// Public Supabase settings (safe for the browser by design). They may arrive with an integration
// prefix (e.g. NEXT_PUBLIC_STORAGE_SUPABASE_URL); expose them under the standard names the
// browser code and proxy read.
const publicSupabaseUrl = envAlias("NEXT_PUBLIC_SUPABASE_URL") ?? envAlias("SUPABASE_URL");
const publicSupabaseAnonKey = envAlias("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? envAlias("SUPABASE_ANON_KEY");
const supabaseHost = publicSupabaseUrl ? new URL(publicSupabaseUrl).hostname : null;

// Content-Security-Policy (production builds only — `next dev` needs eval for hot reload). Scripts stay
// limited to this site + Razorpay Checkout; 'unsafe-inline' is needed for Next.js's inline bootstrap scripts
// and the product JSON-LD (no nonces, so pages can stay statically cached). Connections: this site, the
// Supabase project (auth), Razorpay, and the free reverse-geocoding API used by "Use my location".
// The project's real origin — scheme and port included (a self-hosted or local Supabase may be
// http://host:54321; building "https://host" from the hostname alone blocked every sign-in request).
const supabaseOrigin = publicSupabaseUrl ? new URL(publicSupabaseUrl).origin : "https://*.supabase.co";
const supabaseWs = supabaseOrigin.replace(/^http/, "ws");
// Vercel preview deployments load the Vercel toolbar (feedback/comments) from vercel.live.
const previewToolbar = process.env.VERCEL_ENV === "preview" ? " https://vercel.live" : "";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://*.razorpay.com${previewToolbar}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https: ${supabaseOrigin}`, // + the project origin when it isn't https (self-hosted)
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs} https://*.razorpay.com https://api.bigdatacloud.net${previewToolbar}`,
  `frame-src 'self' https://*.razorpay.com${previewToolbar}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://*.razorpay.com",
  "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self \"https://checkout.razorpay.com\")" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Content-Security-Policy", value: csp }] : []),
];

const nextConfig: NextConfig = {
  transpilePackages: ["@freshbasket/shared"],
  env: {
    ...(publicSupabaseUrl ? { NEXT_PUBLIC_SUPABASE_URL: publicSupabaseUrl } : {}),
    ...(publicSupabaseAnonKey ? { NEXT_PUBLIC_SUPABASE_ANON_KEY: publicSupabaseAnonKey } : {}),
  },
  poweredByHeader: false,
  images: {
    remotePatterns: supabaseHost ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }] : [],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      {
        // Old /shop?category=slug links → clean category URLs.
        source: "/shop",
        has: [{ type: "query", key: "category", value: "(?<cat>[a-z0-9-]{1,60})" }],
        destination: "/category/:cat",
        permanent: true,
      },
      // Shoppers type /orders (the order pages live at /orders/<id>); the list is under the account.
      { source: "/orders", destination: "/account/orders", permanent: false },
    ];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;

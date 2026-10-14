import type { NextConfig } from "next";
import { envAlias } from "./src/lib/env-alias";

// Public Supabase settings (safe for the browser by design). They may arrive with an integration
// prefix (e.g. NEXT_PUBLIC_STORAGE_SUPABASE_URL); expose them under the standard names the
// browser code and proxy read.
const publicSupabaseUrl = envAlias("NEXT_PUBLIC_SUPABASE_URL") ?? envAlias("SUPABASE_URL");
const publicSupabaseAnonKey = envAlias("NEXT_PUBLIC_SUPABASE_ANON_KEY") ?? envAlias("SUPABASE_ANON_KEY");
const supabaseHost = publicSupabaseUrl ? new URL(publicSupabaseUrl).hostname : null;

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(self \"https://checkout.razorpay.com\")" },
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

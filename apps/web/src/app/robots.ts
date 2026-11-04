import type { MetadataRoute } from "next";
import { storeConfig } from "@/config/store";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/account", "/checkout", "/order", "/orders/", "/pay/", "/login", "/cart", "/auth/", "/buy-again", "/reset-password"],
      },
    ],
    // No `Host:` line: it's a non-standard (Yandex-only) directive that doesn't take a scheme; the
    // canonical domain is declared by the sitemap URL and each page's <link rel="canonical">.
    sitemap: `${storeConfig.siteUrl}/sitemap.xml`,
  };
}

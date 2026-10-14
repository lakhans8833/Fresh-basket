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
    sitemap: `${storeConfig.siteUrl}/sitemap.xml`,
    host: storeConfig.siteUrl,
  };
}

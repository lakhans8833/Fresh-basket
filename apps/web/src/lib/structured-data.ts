import type { DeliveryArea, StoreSettings } from "@freshbasket/shared";

/**
 * schema.org JSON-LD for the home page: the WebSite (with the shop search) and the store itself
 * (GroceryStore, a LocalBusiness type). Built ONLY from real data — Admin → Settings and the active
 * delivery areas. Nothing is invented: no ratings, no price range, no opening hours unless they are
 * machine-readable, and no phone number (the owner chose not to publish it, PR #35). A field the owner
 * hasn't filled in is left out rather than guessed.
 */
export function buildStoreJsonLd(
  s: Pick<StoreSettings, "storeName" | "logoUrl" | "supportEmail" | "address" | "social">,
  opts: { siteUrl: string; city: string; state: string; areas: Pick<DeliveryArea, "areaName" | "city">[] },
) {
  const url = opts.siteUrl.replace(/\/+$/, "");
  const abs = (u: string) => (/^https?:\/\//.test(u) ? u : `${url}${u.startsWith("/") ? "" : "/"}${u}`);
  const sameAs = Object.values(s.social).filter((v): v is string => typeof v === "string" && /^https:\/\//.test(v));
  // Delivery areas the owner set up in Admin → Delivery, e.g. "Sector 7, Faridabad" (deduplicated).
  const served = [...new Set(opts.areas.map((a) => [a.areaName, a.city].map((x) => x?.trim()).filter(Boolean).join(", ")).filter(Boolean))];

  const store: Record<string, unknown> = {
    "@type": "GroceryStore",
    "@id": `${url}/#store`,
    name: s.storeName,
    url: `${url}/`,
    logo: abs(s.logoUrl || "/icons/icon-512.png"),
    image: abs("/og-image.jpg"),
    areaServed: served.length ? served.map((name) => ({ "@type": "Place", name })) : { "@type": "City", name: opts.city },
  };
  if (s.supportEmail) store.email = s.supportEmail;
  if (s.address) {
    store.address = { "@type": "PostalAddress", streetAddress: s.address, addressLocality: opts.city, addressRegion: opts.state, addressCountry: "IN" };
  }
  if (sameAs.length) store.sameAs = sameAs;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${url}/#website`,
        name: s.storeName,
        url: `${url}/`,
        inLanguage: "en-IN",
        publisher: { "@id": `${url}/#store` },
        potentialAction: { "@type": "SearchAction", target: `${url}/shop?q={search_term_string}`, "query-input": "required name=search_term_string" },
      },
      store,
    ],
  };
}

/** JSON for a <script type="application/ld+json">: `<` escaped so text can't close the script tag. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

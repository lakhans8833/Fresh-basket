import { describe, expect, it } from "vitest";
import { buildStoreJsonLd, jsonLdString } from "@/lib/structured-data";

const base = {
  storeName: "Rams Fresh Basket",
  logoUrl: null,
  supportEmail: null,
  address: null,
  social: { instagram: null, facebook: null, youtube: null, x: null },
};
const opts = { siteUrl: "https://fresh-basket-veg.vercel.app/", city: "Faridabad", state: "Haryana", areas: [] };

describe("store JSON-LD", () => {
  it("uses only data the owner set: no phone, address, email or socials when empty", () => {
    const ld = buildStoreJsonLd(base, opts);
    const [site, store] = ld["@graph"] as Record<string, unknown>[];
    expect(site.url).toBe("https://fresh-basket-veg.vercel.app/");
    expect((site.potentialAction as { target: string }).target).toBe("https://fresh-basket-veg.vercel.app/shop?q={search_term_string}");
    expect(store["@type"]).toBe("GroceryStore");
    expect(store.logo).toBe("https://fresh-basket-veg.vercel.app/icons/icon-512.png");
    expect(store.areaServed).toEqual({ "@type": "City", name: "Faridabad" });
    for (const k of ["telephone", "address", "email", "sameAs", "aggregateRating", "priceRange", "openingHours"]) expect(store).not.toHaveProperty(k);
  });

  it("includes real settings and delivery areas (deduplicated); ignores non-https social links", () => {
    const ld = buildStoreJsonLd(
      { ...base, supportEmail: "help@example.com", address: "Shop 4, Sector 7 Market", logoUrl: "https://cdn.example.com/logo.png",
        social: { instagram: "https://instagram.com/x", facebook: "javascript:alert(1)", youtube: null, x: null } },
      { ...opts, areas: [{ areaName: "Sector 7", city: "Faridabad" }, { areaName: "Sector 7", city: "Faridabad" }, { areaName: "Sector 9", city: "Faridabad" }] },
    );
    const store = (ld["@graph"] as Record<string, unknown>[])[1];
    expect(store.email).toBe("help@example.com");
    expect(store.address).toMatchObject({ streetAddress: "Shop 4, Sector 7 Market", addressLocality: "Faridabad", addressRegion: "Haryana", addressCountry: "IN" });
    expect(store.logo).toBe("https://cdn.example.com/logo.png");
    expect(store.sameAs).toEqual(["https://instagram.com/x"]);
    expect(store.areaServed).toEqual([{ "@type": "Place", name: "Sector 7, Faridabad" }, { "@type": "Place", name: "Sector 9, Faridabad" }]);
  });

  it("escapes < so store text can't close the script tag", () => {
    const s = jsonLdString(buildStoreJsonLd({ ...base, storeName: "</script><script>alert(1)</script>" }, opts));
    expect(s).not.toContain("</script>");
    expect(JSON.parse(s)["@graph"][0].name).toBe("</script><script>alert(1)</script>");
  });
});

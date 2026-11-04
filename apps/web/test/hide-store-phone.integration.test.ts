/** The store's phone number is not published anywhere (owner's choice, 4 Nov 2026). */
import { afterAll, describe, expect, it } from "vitest";
import { pool, query } from "@/lib/db";
import { GET } from "@/app/api/settings/route";
import { invalidate, CACHE_TAGS } from "@/lib/cache";

afterAll(async () => {
  await query("update store_settings set support_phone = null");
  await pool.end();
});

describe("public settings", () => {
  it("never include the store phone number, even when Admin → Settings has one", async () => {
    await query("update store_settings set support_phone = '+91 90000 11111', whatsapp = '919000011111'");
    try { invalidate(CACHE_TAGS.settings); } catch { /* outside a request: the cache isn't used in tests */ }
    const res = await GET(new Request("https://shop.example/api/settings"), { params: Promise.resolve({}) } as never);
    const body = (await res.json()) as { settings: { supportPhone: string | null; whatsapp: string | null } };
    expect(body.settings.supportPhone).toBeNull();
    expect(JSON.stringify(body)).not.toContain("90000 11111");
    // WhatsApp chat still works (the app needs the number for the wa.me link).
    expect(body.settings.whatsapp).toBe("919000011111");
  });
});

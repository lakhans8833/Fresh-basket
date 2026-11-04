/** FB-26: the proxy's in-memory slug list (TTL, re-check on a miss, fail open). */
import { describe, expect, it, vi } from "vitest";
import { createSlugCache, slugRoute } from "@/lib/known-slugs";

describe("slug cache", () => {
  it("one load per TTL; unknown slug → false; new slug found after the miss re-check", async () => {
    let t = 0;
    const list = { products: ["tomato"], categories: ["roots"] };
    const load = vi.fn(async () => ({ products: [...list.products], categories: [...list.categories] }));
    const known = createSlugCache(load, { now: () => t });
    expect(await known("product", "tomato")).toBe(true);
    expect(await known("product", "nope")).toBe(false);
    expect(await known("category", "roots")).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    list.products.push("dragon-fruit"); // added in admin
    t = 5_000;
    expect(await known("product", "dragon-fruit")).toBe(false); // re-checks at most every 10 s
    t = 11_000;
    expect(await known("product", "dragon-fruit")).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
    t = 12_000;
    expect(await known("product", "nope")).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("fails open: no list (or a too-old list while reloading fails) → null, retried after 10 s", async () => {
    let t = 0;
    let up = false;
    const load = vi.fn(async () => { if (!up) throw new Error("db down"); return { products: ["tomato"], categories: [] }; });
    const known = createSlugCache(load, { now: () => t });
    expect(await known("product", "nope")).toBe(null);
    expect(await known("product", "nope")).toBe(null);
    expect(load).toHaveBeenCalledTimes(1); // no retry storm
    up = true;
    t = 10_001;
    expect(await known("product", "nope")).toBe(false);
    up = false;
    t = 80_000; // list expired and reload fails
    expect(await known("product", "nope")).toBe(null);
    const bad = createSlugCache(async () => ({ oops: 1 }) as never);
    expect(await bad("product", "x")).toBe(null);
  });

  it("concurrent requests share one load", async () => {
    const load = vi.fn(async () => ({ products: ["a"], categories: [] }));
    const known = createSlugCache(load);
    await Promise.all([known("product", "a"), known("product", "b"), known("product", "c")]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("matches only /product/<slug> and /category/<slug>", () => {
    expect(slugRoute("/product/tomato")).toEqual({ kind: "product", slug: "tomato" });
    expect(slugRoute("/category/leafy-greens/")).toEqual({ kind: "category", slug: "leafy-greens" });
    expect(slugRoute("/product/a/b")).toBe(null);
    expect(slugRoute("/products")).toBe(null);
    expect(slugRoute("/product/%E0%A4")).toBe(null);
  });
});

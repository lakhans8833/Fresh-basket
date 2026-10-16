import { describe, expect, it } from "vitest";
import { addablePacks, formatWeight, productStockSummary } from "../src/stock";

const mint = {
  stockGrams: 2000,
  variants: [
    { id: "g100", label: "100 g", stock: 20, active: true },
    { id: "g250", label: "250 g", stock: 8, active: true },
    { id: "g500", label: "500 g", stock: 4, active: true },
    { id: "kg1", label: "1 kg", stock: 2, active: true },
  ],
};
const cart = (m: Record<string, number>) => (id: string) => m[id] ?? 0;

describe("shared weight stock", () => {
  it("admin total is the real weight, not the sum of possible pack counts (was '34 in stock')", () => {
    const s = productStockSummary(mint.stockGrams, mint.variants);
    expect(s.text).toBe("2 kg in stock");
    expect(s.kind).toBe("weight");
    expect(s.low).toBe(false); // 20 × 100 g
  });
  it("low / out / a size out", () => {
    expect(productStockSummary(400, mint.variants)).toMatchObject({ low: true, out: false, someSizeOut: true, text: "400 g in stock" });
    expect(productStockSummary(60, mint.variants)).toMatchObject({ out: true, text: "Out of stock (60 g left)" });
    expect(productStockSummary(0, mint.variants).text).toBe("Out of stock");
  });
  it("per-pack products keep per-pack totals", () => {
    const s = productStockSummary(null, [{ id: "a", label: "1 bunch", stock: 3 }, { id: "b", label: "2 bunch", stock: 0 }]);
    expect(s).toMatchObject({ kind: "packs", text: "3 in stock", low: true, someSizeOut: true });
  });
  it("mixed pack sizes in the cart share the total", () => {
    // 1 × 1 kg + 2 × 250 g = 1.5 kg used → 500 g left
    const c = cart({ kg1: 1, g250: 2 });
    expect(addablePacks(mint, "kg1", c, 20)).toBe(0);
    expect(addablePacks(mint, "g500", c, 20)).toBe(1);
    expect(addablePacks(mint, "g100", c, 20)).toBe(5);
    expect(addablePacks(mint, "g250", c, 20)).toBe(2);
  });
  it("respects the per-line maximum and non-weight stock", () => {
    expect(addablePacks(mint, "g100", cart({ g100: 15 }), 20)).toBe(5);
    expect(addablePacks({ stockGrams: null, variants: [{ id: "x", label: "1 pc", stock: 4 }] }, "x", cart({ x: 3 }), 20)).toBe(1);
  });
  it("formats weights", () => {
    expect([formatWeight(2000), formatWeight(1500), formatWeight(750), formatWeight(0), formatWeight(1250)]).toEqual(["2 kg", "1.5 kg", "750 g", "0 kg", "1.25 kg"]);
  });
});

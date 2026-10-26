import { describe, expect, it } from "vitest";
import { uniqueRails } from "../src/home-rails";

const p = (...ids: string[]) => ids.map((id) => ({ id }));

describe("uniqueRails", () => {
  it("never shows a product twice; earlier rows win", () => {
    const rows = uniqueRails([
      { id: "popular", products: p("a", "b", "c"), max: 2 },
      { id: "deals", products: p("b", "c", "d"), max: 5, min: 2 },
      { id: "veg", products: p("a", "c", "e", "f"), max: 5, min: 2 },
    ]);
    expect(rows.map((r) => [r.id, r.products.map((x) => x.id)])).toEqual([
      ["popular", ["a", "b"]],
      ["deals", ["c", "d"]],
      ["veg", ["e", "f"]],
    ]);
  });
  it("drops a row with too few new products, without using them up", () => {
    const rows = uniqueRails([
      { id: "popular", products: p("a", "b"), max: 5 },
      { id: "greens", products: p("a", "c"), max: 5, min: 2 }, // only "c" is new → dropped
      { id: "seasonal", products: p("c", "d"), max: 5, min: 2 }, // "c" still available here
    ]);
    expect(rows.map((r) => r.id)).toEqual(["popular", "seasonal"]);
    expect(rows[1]!.products.map((x) => x.id)).toEqual(["c", "d"]);
  });
  it("counts only products actually shown (cut by max) as used", () => {
    const rows = uniqueRails([
      { id: "a", products: p("1", "2", "3"), max: 1 },
      { id: "b", products: p("2", "3"), max: 5, min: 2 },
    ]);
    expect(rows[1]!.products.map((x) => x.id)).toEqual(["2", "3"]);
  });
});

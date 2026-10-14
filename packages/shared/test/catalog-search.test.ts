import { describe, expect, it } from "vitest";
import { englishNameFor, expandSearchTerms, packGrams, unitPriceLabel } from "../src/catalog-search";

describe("expandSearchTerms", () => {
  it("maps Hindi names to English", () => {
    expect(expandSearchTerms("tamatar")).toEqual(["tamatar", "tomato"]);
    expect(expandSearchTerms("  Aloo ")).toEqual(["aloo", "potato"]);
    expect(expandSearchTerms("shimla mirch")).toEqual(["shimla mirch", "capsicum"]);
    expect(expandSearchTerms("fresh palak")).toEqual(["fresh palak", "spinach"]);
  });
  it("keeps English queries as they are", () => {
    expect(expandSearchTerms("tomato")).toEqual(["tomato"]);
    expect(expandSearchTerms("")).toEqual([]);
    expect(englishNameFor("tomato")).toBeNull();
    expect(englishNameFor("pyaz")).toBe("onion");
  });
});

describe("packGrams / unitPriceLabel", () => {
  it("parses weights", () => {
    expect(packGrams("500 g")).toBe(500);
    expect(packGrams("1 kg")).toBe(1000);
    expect(packGrams("1.5kg")).toBe(1500);
    expect(packGrams("250 gm")).toBe(250);
    expect(packGrams("1 bunch")).toBeNull();
  });
  it("formats price per 100 g", () => {
    expect(unitPriceLabel(3200, "500 g")).toBe("₹6.40 / 100 g");
    expect(unitPriceLabel(6000, "1 kg")).toBe("₹6.00 / 100 g");
    expect(unitPriceLabel(700, "100 g")).toBe("₹7.00 / 100 g");
    expect(unitPriceLabel(1500, "1 bunch")).toBeNull();
  });
});

describe("expandSearchTerms — English names and Devanagari", () => {
  it("doesn't turn 'sweet lime' into lemon", () => {
    expect(expandSearchTerms("sweet lime")).toEqual(["sweet lime"]);
    expect(englishNameFor("sweet lime")).toBeNull();
  });
  it("still maps Hindi words inside a phrase", () => {
    expect(expandSearchTerms("fresh tamatar")).toContain("tomato");
  });
  it("keeps Devanagari text", () => {
    expect(expandSearchTerms("टमाटर tomato")[0]).toBe("टमाटर tomato");
  });
});

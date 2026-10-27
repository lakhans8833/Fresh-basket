import { describe, expect, it } from "vitest";
import { englishNameFor, expandSearchTerms, looseMatch, packGrams, singular, unitPriceLabel } from "../src/catalog-search";

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
  it("formats price per kg", () => {
    expect(unitPriceLabel(9000, "500 g")).toBe("₹180/kg");
    expect(unitPriceLabel(3200, "500 g")).toBe("₹64/kg");
    expect(unitPriceLabel(700, "100 g")).toBe("₹70/kg");
    expect(unitPriceLabel(1850, "250 g")).toBe("₹74/kg");
    expect(unitPriceLabel(1333, "250 g")).toBe("₹53.32/kg");
    expect(unitPriceLabel(13500, "2 kg")).toBe("₹67.50/kg");
    expect(unitPriceLabel(6000, "1 kg")).toBeNull(); // already per kg
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

describe("looseMatch (fallback search)", () => {
  const hay = (name: string, cat = "Daily Vegetables") => [name, cat];
  it("plurals, extra words and one-letter typos", () => {
    expect(singular("tomatoes")).toBe("tomato");
    expect(looseMatch("tomatoes", hay("Tomato (Tamatar)"))).toBe(true);
    expect(looseMatch("potatoes", hay("Potato (Aloo)"))).toBe(true);
    expect(looseMatch("carrots", hay("Carrot (Gajar)"))).toBe(true);
    expect(looseMatch("cucumbers", hay("Cucumber (Kheera)"))).toBe(true);
    expect(looseMatch("green capsicum", hay("Capsicum (Shimla Mirch)"))).toBe(true);
    expect(looseMatch("brocoli", hay("Broccoli", "Exotic"))).toBe(true);
    expect(looseMatch("carot", hay("Carrot (Gajar)"))).toBe(true);
  });
  it("stays relevant", () => {
    expect(looseMatch("tomatoes", hay("Potato (Aloo)"))).toBe(false);
    expect(looseMatch("green capsicum", hay("Green Chilli (Hari Mirch)"))).toBe(false);
    expect(looseMatch("apple", hay("Pineapple", "Fresh Fruits"))).toBe(false);
    expect(looseMatch("pea", hay("Pear", "Fresh Fruits"))).toBe(true); // prefix: acceptable
  });
});

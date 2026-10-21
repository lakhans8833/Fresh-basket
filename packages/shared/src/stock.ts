import { packGrams } from "./catalog-search";

/**
 * Shared ("stock by weight") inventory helpers.
 *
 * A product sold by weight keeps ONE total in grams (products.stock_grams); each pack size's `stock`
 * is only "how many of this pack the total could make" (2 kg → 20 × 100 g OR 8 × 250 g OR 2 × 1 kg).
 * Those per-pack counts must never be added up (that gave "34 in stock" for 2 kg of mint), and two
 * pack sizes in one cart draw from the same total.
 */

/** "2 kg", "1.5 kg", "750 g", "0 kg". */
export function formatWeight(grams: number): string {
  const g = Math.max(0, Math.round(grams));
  if (g === 0) return "0 kg";
  if (g < 1000) return `${g} g`;
  const kg = g / 1000;
  return `${Number.isInteger(kg) ? kg : kg.toLocaleString("en-IN", { maximumFractionDigits: 3 })} kg`;
}

export interface StockVariant {
  id: string;
  label: string;
  stock: number;
  active?: boolean;
}

/** True when this product's packs share one weight total (and every pack has a weight). */
export function sharesWeightStock(stockGrams: number | null | undefined, variants: StockVariant[]): stockGrams is number {
  return stockGrams !== null && stockGrams !== undefined && variants.length > 0 && variants.every((v) => packGrams(v.label) !== null);
}

/**
 * How many MORE packs of `variantId` can be added, given what is already in the cart.
 * Weight products: the grams already taken by every pack size of the product in the cart are
 * subtracted from the shared total first. Other products: per-pack stock minus what's in the cart.
 */
export function addablePacks(
  product: { stockGrams?: number | null; variants: StockVariant[] },
  variantId: string,
  inCart: (variantId: string) => number,
  maxPerLine: number,
): number {
  const v = product.variants.find((x) => x.id === variantId);
  if (!v) return 0;
  const inLine = inCart(v.id);
  const roomInLine = Math.max(0, maxPerLine - inLine);
  const grams = packGrams(v.label);
  if (!sharesWeightStock(product.stockGrams, product.variants) || !grams) {
    return Math.max(0, Math.min(roomInLine, v.stock - inLine));
  }
  let used = 0;
  for (const x of product.variants) used += inCart(x.id) * (packGrams(x.label) ?? 0);
  const left = Math.max(0, product.stockGrams - used);
  return Math.max(0, Math.min(roomInLine, Math.floor(left / grams)));
}

export interface ProductStockSummary {
  kind: "weight" | "packs";
  /** Weight products: total grams; pack products: total packs across active sizes. */
  amount: number;
  /** Ready-to-show text: "2 kg in stock", "12 packs in stock", "Out of stock". */
  text: string;
  out: boolean;
  low: boolean;
  /** Some active size can't be bought right now (e.g. 1 kg when only 600 g is left). */
  someSizeOut: boolean;
}

/** A pack is "low" with 5 or fewer left; a weight product when it can make 5 or fewer of its smallest pack. */
export const LOW_STOCK_PACKS = 5;

export function productStockSummary(stockGrams: number | null | undefined, variants: StockVariant[]): ProductStockSummary {
  const active = variants.filter((v) => v.active !== false);
  if (sharesWeightStock(stockGrams, active.length ? active : variants)) {
    const smallest = Math.min(...(active.length ? active : variants).map((v) => packGrams(v.label)!));
    const out = stockGrams < smallest;
    return {
      kind: "weight",
      amount: stockGrams,
      text: out ? (stockGrams > 0 ? `Out of stock (${formatWeight(stockGrams)} left)` : "Out of stock") : `${formatWeight(stockGrams)} in stock`,
      out,
      low: !out && stockGrams <= LOW_STOCK_PACKS * smallest,
      someSizeOut: !out && active.some((v) => (packGrams(v.label) ?? 0) > stockGrams),
    };
  }
  const total = active.reduce((s, v) => s + Math.max(0, v.stock), 0);
  return {
    kind: "packs",
    amount: total,
    text: total === 0 ? "Out of stock" : `${total} in stock`,
    out: total === 0,
    low: active.some((v) => v.stock > 0 && v.stock <= LOW_STOCK_PACKS),
    someSizeOut: total > 0 && active.some((v) => v.stock === 0),
  };
}

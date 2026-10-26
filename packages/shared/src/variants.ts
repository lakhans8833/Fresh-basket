/** Pack-size choices shared by the website and the phone app, so both open on the same pack. */

/** Pack shown first: 500 g when it's in stock (the usual vegetable pack), else the first in-stock size. */
export function defaultVariant<V extends { label: string; stock: number; active?: boolean }>(variants: V[]): V | undefined {
  const usable = variants.filter((v) => v.active !== false);
  const inStock = usable.filter((v) => v.stock > 0);
  return inStock.find((v) => /^500\s*(g|gm|gms|grams?)$/i.test(v.label.trim())) ?? inStock[0] ?? usable[0] ?? variants[0];
}

/** Whole-number % below MRP, or null when there is no real discount. */
export function percentOff(price: number, mrp: number | null | undefined): number | null {
  if (!mrp || mrp <= price || price <= 0) return null;
  const pct = Math.floor(((mrp - price) / mrp) * 100);
  return pct >= 1 ? pct : null;
}

/** In-stock pack with the biggest saving below MRP, or undefined if none is discounted. */
export function bestDealVariant<V extends { price: number; mrp: number | null; stock: number }>(variants: V[]): V | undefined {
  let best: V | undefined;
  let bestPct = 0;
  for (const v of variants) {
    if (v.stock <= 0) continue;
    const pct = percentOff(v.price, v.mrp) ?? 0;
    if (pct > bestPct) {
      best = v;
      bestPct = pct;
    }
  }
  return best;
}

/** Pack shown first: 500 g when it's in stock (the usual vegetable pack), else the first in-stock size. */
export function defaultVariant<V extends { label: string; stock: number }>(variants: V[]): V | undefined {
  const inStock = variants.filter((v) => v.stock > 0);
  return inStock.find((v) => /^500\s*(g|gm|gms|grams?)$/i.test(v.label.trim())) ?? inStock[0] ?? variants[0];
}

/** In-stock pack with the biggest saving below MRP (whole-number %), or undefined if none is discounted. */
export function bestDealVariant<V extends { price: number; mrp: number | null; stock: number }>(variants: V[]): V | undefined {
  let best: V | undefined;
  let bestPct = 0;
  for (const v of variants) {
    if (v.stock <= 0 || !v.mrp || v.mrp <= v.price) continue;
    const pct = Math.floor(((v.mrp - v.price) / v.mrp) * 100);
    if (pct > bestPct) {
      best = v;
      bestPct = pct;
    }
  }
  return best;
}

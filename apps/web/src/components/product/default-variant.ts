/** Pack shown first: 500 g when it's in stock (the usual vegetable pack), else the first in-stock size. */
export function defaultVariant<V extends { label: string; stock: number }>(variants: V[]): V | undefined {
  const inStock = variants.filter((v) => v.stock > 0);
  return inStock.find((v) => /^500\s*(g|gm|gms|grams?)$/i.test(v.label.trim())) ?? inStock[0] ?? variants[0];
}

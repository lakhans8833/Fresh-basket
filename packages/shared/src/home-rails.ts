/**
 * Home page rows without repeats: each product appears in the FIRST row (in page order) that wants it,
 * so "Popular picks", "Deals of the Day", the category rows and "In Season Now" don't show the same
 * items again and again. A row left with fewer than `min` new products is dropped (its category stays
 * one tap away in "Shop by category" / "see all").
 */
export interface RailCandidate<P extends { id: string }> {
  id: string;
  /** Products this row would like to show, best first. */
  products: P[];
  max: number;
  min?: number;
}

export function uniqueRails<P extends { id: string }, R extends RailCandidate<P>>(rails: R[]): (R & { products: P[] })[] {
  const shown = new Set<string>();
  const out: (R & { products: P[] })[] = [];
  for (const r of rails) {
    const picked: P[] = [];
    for (const p of r.products) {
      if (picked.length >= r.max) break;
      if (!shown.has(p.id) && !picked.some((x) => x.id === p.id)) picked.push(p);
    }
    if (picked.length < (r.min ?? 1)) continue;
    for (const p of picked) shown.add(p.id);
    out.push({ ...r, products: picked });
  }
  return out;
}

/** Row sizes used by the website and the app. */
export const HOME_RAIL = { popular: 10, deals: 10, category: 12, seasonal: 12, minRow: 2 } as const;

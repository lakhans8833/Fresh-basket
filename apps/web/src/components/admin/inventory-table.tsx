"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Boxes, RotateCcw, Save, Search } from "lucide-react";
import { api } from "@/lib/client/api";
import { Button } from "../ui/button";
import { Input, inputClass } from "../ui/form";
import { EmptyState, Notice } from "../ui/feedback";
import { useToast } from "../ui/toast";
import { cn } from "../ui/cn";
import { errorMessage, useAdminData } from "./use-admin-data";
import { useAdmin } from "./admin-context";
import { inputToPaise, paiseToInput } from "./money";
import { Badge, Card, LoadError, LoadingRows, PageHeader } from "./ui";
import { productStockSummary } from "@freshbasket/shared";

interface Row {
  variantId: string;
  productId: string;
  productName: string;
  label: string;
  price: number;
  stock: number;
  active: boolean;
  productActive: boolean;
  categoryName: string;
  /** Stock-by-weight products: total in grams (null = each pack has its own stock). */
  productStockGrams: number | null;
  packGrams: number | null;
}
type Edit = { price?: string; stock?: string; active?: boolean };
type Filter = "all" | "low" | "out" | "inactive";

const LOW = 5;

export function InventoryTable({ initialQ, initialFilter }: { initialQ: string; initialFilter: string }) {
  const toast = useToast();
  const { role } = useAdmin();
  const { data, error, reload } = useAdminData<{ rows: Row[] }>("/api/admin/inventory");
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  // Stock-by-weight products: edited total in kg, by product id.
  const [totals, setTotals] = useState<Record<string, string>>({});
  const [q, setQ] = useState(initialQ);
  const [filter, setFilter] = useState<Filter>((["all", "low", "out", "inactive"] as const).find((f) => f === initialFilter) ?? "all");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const rows = useMemo(() => data?.rows ?? [], [data]);

  const isWeight = (r: Row) => r.productStockGrams !== null && r.packGrams !== null && r.packGrams > 0;
  const kgText = (grams: number) => String(Math.round(grams) / 1000);
  /** Total grams for a stock-by-weight product, including an unsaved edit (null if the edit is invalid). */
  function totalGrams(r: Row): number | null {
    const t = totals[r.productId];
    if (t === undefined) return r.productStockGrams;
    return /^\d+(\.\d{1,3})?$/.test(t.trim()) ? Math.round(Number(t) * 1000) : null;
  }

  // Effective value of a row, including unsaved edits.
  function eff(r: Row) {
    const e = edits[r.variantId] ?? {};
    if (isWeight(r)) {
      const g = totalGrams(r) ?? r.productStockGrams ?? 0;
      const stock = Math.floor(g / r.packGrams!);
      return { priceText: e.price ?? paiseToInput(r.price), stockText: String(stock), stock, active: e.active ?? r.active };
    }
    const stockText = e.stock ?? String(r.stock);
    const stock = /^\d+$/.test(stockText) ? Number(stockText) : r.stock;
    return { priceText: e.price ?? paiseToInput(r.price), stockText, stock, active: e.active ?? r.active };
  }

  // Compute the PATCH payload: only rows that actually differ from the server.
  const { updates, invalid } = useMemo(() => {
    const updates: { variantId: string; price?: number; stock?: number; active?: boolean }[] = [];
    const invalid = new Set<string>();
    for (const r of rows) {
      const e = edits[r.variantId];
      if (!e) continue;
      const u: (typeof updates)[number] = { variantId: r.variantId };
      if (e.price !== undefined) {
        const p = inputToPaise(e.price);
        if (p === null || Number.isNaN(p)) invalid.add(`${r.variantId}:price`);
        else if (p !== r.price) u.price = p;
      }
      if (e.stock !== undefined) {
        if (!/^\d+$/.test(e.stock)) invalid.add(`${r.variantId}:stock`);
        else if (Number(e.stock) !== r.stock) u.stock = Number(e.stock);
      }
      if (e.active !== undefined && e.active !== r.active) u.active = e.active;
      if (Object.keys(u).length > 1) updates.push(u);
    }
    return { updates, invalid };
  }, [rows, edits]);
  const { productUpdates, invalidTotals } = useMemo(() => {
    const productUpdates: { productId: string; stockGrams: number }[] = [];
    const invalidTotals = new Set<string>();
    const seen = new Set<string>();
    for (const r of rows) {
      if (!isWeight(r) || seen.has(r.productId) || totals[r.productId] === undefined) continue;
      seen.add(r.productId);
      const g = totalGrams(r);
      if (g === null) invalidTotals.add(r.productId);
      else if (g !== r.productStockGrams) productUpdates.push({ productId: r.productId, stockGrams: g });
    }
    return { productUpdates, invalidTotals };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- derived from rows + totals only
  }, [rows, totals]);
  const changed = new Set(updates.map((u) => u.variantId));
  const changedProducts = new Set(productUpdates.map((u) => u.productId));
  const dirty = updates.length > 0 || invalid.size > 0 || productUpdates.length > 0 || invalidTotals.size > 0;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Low / out for weight products is decided on the product's shared total (2 kg of mint is not
  // "low" just because the 1 kg size can only be made twice); other packs are judged one by one.
  const productLevel = useMemo(() => {
    const byProduct = new Map<string, Row[]>();
    for (const r of rows) if (r.productStockGrams !== null) byProduct.set(r.productId, [...(byProduct.get(r.productId) ?? []), r]);
    const out = new Map<string, ReturnType<typeof productStockSummary>>();
    for (const [id, rs] of byProduct) {
      out.set(id, productStockSummary(rs[0]!.productStockGrams, rs.map((r) => ({ id: r.variantId, label: r.label, stock: r.stock, active: r.active }))));
    }
    return out;
  }, [rows]);
  const stockState = (r: Row): "out" | "low" | "ok" => {
    const pl = r.productStockGrams !== null ? productLevel.get(r.productId) : undefined;
    if (pl && pl.kind === "weight") return pl.out ? "out" : pl.low ? "low" : "ok";
    return r.stock === 0 ? "out" : r.stock <= LOW ? "low" : "ok";
  };

  const counts = useMemo(() => {
    let low = 0, out = 0, inactive = 0;
    for (const r of rows) {
      if (!r.active || !r.productActive) inactive++;
      else if (stockState(r) === "out") out++;
      else if (stockState(r) === "low") low++;
    }
    return { all: rows.length, low, out, inactive };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stockState only reads productLevel
  }, [rows, productLevel]);

  const visible = rows.filter((r) => {
    const needle = q.trim().toLowerCase();
    if (needle && !`${r.productName} ${r.label} ${r.categoryName}`.toLowerCase().includes(needle)) return false;
    const live = r.active && r.productActive;
    if (filter === "low") return live && stockState(r) === "low";
    if (filter === "out") return live && stockState(r) === "out";
    if (filter === "inactive") return !live;
    return true;
  });

  function edit(id: string, patch: Edit) {
    setEdits((e) => ({ ...e, [id]: { ...e[id], ...patch } }));
  }

  async function save() {
    setSaveError(null);
    if (invalid.size || invalidTotals.size) {
      setSaveError("Some prices or stock values aren't valid numbers (total stock: kg, e.g. 25 or 2.5). Fix the highlighted cells.");
      return;
    }
    if (!updates.length && !productUpdates.length) return;
    setSaving(true);
    try {
      // The API accepts up to 200 rows per request.
      for (let i = 0; i < Math.max(updates.length, productUpdates.length); i += 200) {
        await api("/api/admin/inventory", { method: "PATCH", json: { updates: updates.slice(i, i + 200), products: productUpdates.slice(i, i + 200) } });
      }
      const n = updates.length + productUpdates.length;
      toast(`Saved ${n} change${n === 1 ? "" : "s"}`);
      await reload();
      setEdits({});
      setTotals({});
    } catch (e) {
      setSaveError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const FILTERS: { v: Filter; label: string; n: number }[] = [
    { v: "all", label: "All", n: counts.all },
    { v: "low", label: "Low stock", n: counts.low },
    { v: "out", label: "Out of stock", n: counts.out },
    { v: "inactive", label: "Hidden", n: counts.inactive },
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Update prices and stock at once. Products sold by weight have one total stock in kg — every pack size (100 g, 250 g, 500 g, 1 kg…) is worked out from it. Changes are saved together."
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <label htmlFor="inv-search" className="sr-only">Search inventory</label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="inv-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product, size or category" className="pl-10" />
        </div>
        <div className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
          <div role="group" aria-label="Filter" className="inline-flex gap-1 rounded-full border border-line bg-white p-1">
            {FILTERS.map((f) => (
              <button
                key={f.v}
                type="button"
                aria-pressed={filter === f.v}
                onClick={() => setFilter(f.v)}
                className={cn("whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium", filter === f.v ? "bg-forest-800 text-white" : "text-ink-soft hover:bg-sage-100")}
              >
                {f.label} <span className={cn("tabular-nums", filter === f.v ? "text-white/70" : "text-muted")}>{f.n}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {saveError ? <Notice tone="error" className="mb-4">{saveError}</Notice> : null}

      {error && !data ? (
        <LoadError message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingRows rows={8} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Boxes className="size-7" aria-hidden />} title="No products yet" action={role === "admin" ? <Link href="/admin/products/new" className="font-semibold text-leaf-600">Add a product</Link> : undefined}>
          Inventory lists every weight option of every product.
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState icon={<Search className="size-7" aria-hidden />} title="Nothing matches">
          {filter === "low" ? "No items are running low." : filter === "out" ? "Nothing is out of stock." : "Try a different search or filter."}
        </EmptyState>
      ) : (
        <Card className="overflow-hidden pb-1">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-sage-50 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">Product</th>
                  <th scope="col" className="px-2 py-2.5 font-semibold">Size</th>
                  <th scope="col" className="w-36 px-2 py-2.5 font-semibold">Price (₹)</th>
                  <th scope="col" className="w-28 px-2 py-2.5 font-semibold">Stock</th>
                  <th scope="col" className="w-24 px-2 py-2.5 text-center font-semibold">Active</th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((r, i) => {
                  const v = eff(r);
                  const weight = isWeight(r);
                  const firstOfProduct = i === 0 || visible[i - 1]!.productId !== r.productId;
                  const totalBad = invalidTotals.has(r.productId);
                  const header = weight && firstOfProduct ? (
                    <tr key={`${r.productId}-total`} className={cn("bg-sage-50/70", changedProducts.has(r.productId) && "bg-lime-50")}>
                      <td className="px-4 py-2" colSpan={3}>
                        <div className="font-semibold text-ink">{r.productName}</div>
                        <div className="text-xs text-muted">Sold by weight — one stock for all pack sizes</div>
                      </td>
                      <td className="px-2 py-2" colSpan={3}>
                        <label className="flex items-center gap-2 text-sm">
                          <span className="whitespace-nowrap font-medium text-ink-soft">Total stock</span>
                          <span className="relative">
                            <input
                              aria-label={`Total stock for ${r.productName}, in kg`}
                              inputMode="decimal"
                              value={totals[r.productId] ?? kgText(r.productStockGrams ?? 0)}
                              onChange={(e) => setTotals((t) => ({ ...t, [r.productId]: e.target.value.replace(/[^\d.]/g, "") }))}
                              aria-invalid={totalBad || undefined}
                              className={cn(inputClass, "h-9 w-28 rounded-lg pl-2.5 pr-8 text-sm tabular-nums")}
                            />
                            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-muted">kg</span>
                          </span>
                        </label>
                      </td>
                    </tr>
                  ) : null;
                  const priceBad = invalid.has(`${r.variantId}:price`);
                  const stockBad = invalid.has(`${r.variantId}:stock`);
                  const isChanged = changed.has(r.variantId);
                  const live = v.active && r.productActive;
                  return (
                    [header,
                    <tr key={r.variantId} className={cn(isChanged ? "bg-lime-50" : live && v.stock === 0 ? "bg-danger-bg/50" : live && v.stock <= LOW ? "bg-[#fdf6e7]/60" : "", !live && "text-muted")}>
                      <td className="px-4 py-1.5">
                        <div className="font-medium text-ink">{r.productName}</div>
                        <div className="text-xs text-muted">{r.categoryName}{!r.productActive ? " · product hidden" : ""}</div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5">{r.label}</td>
                      <td className="px-2 py-1.5">
                        <div className="relative">
                          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-muted">₹</span>
                          <input
                            aria-label={`Price for ${r.productName} ${r.label}, in rupees`}
                            inputMode="decimal"
                            value={v.priceText}
                            onChange={(e) => edit(r.variantId, { price: e.target.value })}
                            aria-invalid={priceBad || undefined}
                            className={cn(inputClass, "h-9 rounded-lg pl-6 pr-2 text-sm tabular-nums")}
                          />
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        {weight ? (
                          <span className="block px-1 text-sm tabular-nums text-ink-soft" title="Worked out from the product's total stock">= {v.stock} <span className="text-xs text-muted">packs</span></span>
                        ) : (
                        <input
                          aria-label={`Stock for ${r.productName} ${r.label}`}
                          inputMode="numeric"
                          value={v.stockText}
                          onChange={(e) => edit(r.variantId, { stock: e.target.value.replace(/[^\d]/g, "") })}
                          aria-invalid={stockBad || undefined}
                          className={cn(inputClass, "h-9 rounded-lg px-2.5 text-sm tabular-nums")}
                        />
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${r.productName} ${r.label} active`}
                          checked={v.active}
                          onChange={(e) => edit(r.variantId, { active: e.target.checked })}
                          className="size-4.5 accent-leaf-600"
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-1.5">
                        {isChanged ? (
                          <Badge tone="lime">Edited</Badge>
                        ) : !live ? (
                          <Badge>Hidden</Badge>
                        ) : v.stock === 0 ? (
                          <Badge tone="red">Out of stock</Badge>
                        ) : v.stock <= LOW ? (
                          <Badge tone="amber">Low stock</Badge>
                        ) : (
                          <Badge tone="green">In stock</Badge>
                        )}
                      </td>
                    </tr>]
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Sticky save bar */}
      <div
        className={cn(
          "sticky bottom-4 z-30 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-full border border-line bg-forest-900 py-2 pl-5 pr-2 text-white shadow-[var(--shadow-lift)] transition-opacity",
          dirty ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!dirty}
      >
        <span className="text-sm" aria-live="polite">
          {invalid.size + invalidTotals.size ? `${invalid.size + invalidTotals.size} cell${invalid.size + invalidTotals.size === 1 ? "" : "s"} need fixing` : `${updates.length + productUpdates.length} unsaved change${updates.length + productUpdates.length === 1 ? "" : "s"}`}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" className="text-white hover:bg-white/10" onClick={() => { setEdits({}); setTotals({}); setSaveError(null); }} disabled={saving} tabIndex={dirty ? 0 : -1}>
            <RotateCcw className="size-4" aria-hidden /> Discard
          </Button>
          <Button size="sm" variant="lime" onClick={save} loading={saving} tabIndex={dirty ? 0 : -1}>
            {!saving ? <Save className="size-4" aria-hidden /> : null} Save changes
          </Button>
        </div>
      </div>
    </>
  );
}

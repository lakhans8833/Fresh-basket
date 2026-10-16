"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Package, Plus, Search, ChevronRight, Scale } from "lucide-react";
import { api } from "@/lib/client/api";
import { useToast } from "../ui/toast";
import { formatINR, productStockSummary } from "@freshbasket/shared";
import { Button, ButtonLink } from "../ui/button";
import { Input } from "../ui/form";
import { EmptyState } from "../ui/feedback";
import { cn } from "../ui/cn";
import { errorMessage, useAdminData } from "./use-admin-data";
import { AdminOnly } from "./admin-context";
import { Badge, Card, LoadError, LoadingRows, PageHeader, Thumb } from "./ui";

interface Row {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  featured: boolean;
  seasonal: boolean;
  categoryName: string;
  imageUrl: string | null;
  variants: { id: string; label: string; price: number; stock: number; active: boolean }[];
  /** Weight products: the shared total in grams (each size's `stock` is only what that total could make). */
  stockGrams: number | null;
}

function summary(p: Row) {
  const active = p.variants.filter((v) => v.active);
  const prices = active.map((v) => v.price);
  // Never add up the sizes of a weight product: they are alternative ways to sell ONE total.
  const st = productStockSummary(p.stockGrams, active);
  const priceText = prices.length === 0 ? "—" : Math.min(...prices) === Math.max(...prices) ? formatINR(prices[0]!) : `${formatINR(Math.min(...prices))} – ${formatINR(Math.max(...prices))}`;
  return { active, priceText, st };
}

function Flags({ p }: { p: Row }) {
  return (
    <div className="flex flex-wrap gap-1">
      {p.active ? <Badge tone="green">Live</Badge> : <Badge tone="red">Hidden</Badge>}
      {p.featured ? <Badge tone="lime">Featured</Badge> : null}
      {p.seasonal ? <Badge tone="amber">Seasonal</Badge> : null}
    </div>
  );
}

function StockText({ s }: { s: ReturnType<typeof summary> }) {
  if (s.active.length === 0) return <span className="text-muted">No active sizes</span>;
  return (
    <span className={cn("tabular-nums", s.st.out ? "font-semibold text-danger" : s.st.someSizeOut || s.st.low ? "font-semibold text-[#7a5212]" : "text-ink")}>
      {s.st.text}
      {!s.st.out && s.st.low ? " · running low" : !s.st.out && s.st.someSizeOut ? " · a size is out" : ""}
      {s.st.kind === "weight" ? <span className="block text-xs font-normal text-muted">Shared by all sizes</span> : null}
    </span>
  );
}

export function ProductsList() {
  return (
    <AdminOnly>
      <ProductsListInner />
    </AdminOnly>
  );
}

function ProductsListInner() {
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDq(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading, reload } = useAdminData<{ products: Row[] }>(`/api/admin/products${dq ? `?q=${encodeURIComponent(dq)}` : ""}`);
  const products = data?.products ?? [];
  const toast = useToast();
  const [sizing, setSizing] = useState(false);

  async function addStandardSizes() {
    if (!confirm("Add 100 g, 250 g, 500 g and 1 kg sizes to every product sold by weight?\n\nNew sizes are priced in proportion to each product's existing price (rounded up to the next rupee). New sizes start with stock 0 — set real stock in Inventory before they can be ordered. Products sold per bunch/piece are skipped.")) return;
    setSizing(true);
    try {
      const r = await api<{ added: number }>("/api/admin/products/standard-sizes", { method: "POST", json: {} });
      toast(r.added ? `${r.added} pack size${r.added === 1 ? "" : "s"} added with stock 0 — set their stock in Inventory` : "All weight-based products already have these sizes");
      reload();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setSizing(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Products"
        description="Your catalogue: photos, descriptions and weight options with prices."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={addStandardSizes} loading={sizing}><Scale className="size-4" aria-hidden /> Add 100 g – 1 kg sizes</Button>
            <ButtonLink href="/admin/products/new"><Plus className="size-4" aria-hidden /> Add product</ButtonLink>
          </div>
        }
      />
      <div className="relative mb-5 max-w-md">
        <label htmlFor="product-search" className="sr-only">Search products</label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input id="product-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="pl-10" />
      </div>

      {error && !data ? (
        <LoadError message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingRows rows={6} />
      ) : products.length === 0 ? (
        <EmptyState
          icon={<Package className="size-7" aria-hidden />}
          title={dq ? "No matching products" : "No products yet"}
          action={dq ? undefined : <ButtonLink href="/admin/products/new"><Plus className="size-4" aria-hidden /> Add your first product</ButtonLink>}
        >
          {dq ? `Nothing matches “${dq}”.` : "Add vegetables with photos and weight options to start selling."}
        </EmptyState>
      ) : (
        <div className={cn("transition-opacity", loading && "opacity-60")} aria-busy={loading}>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-sage-50 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Product</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Category</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Sizes &amp; price</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Stock</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {products.map((p) => {
                  const s = summary(p);
                  return (
                    <tr key={p.id} className={cn("group relative hover:bg-sage-50/70", !p.active && "bg-sage-50/40")}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <Thumb src={p.imageUrl} alt={p.name} className={cn("size-12 shrink-0 overflow-hidden rounded-xl", !p.active && "opacity-60")} />
                          <div className="min-w-0">
                            <Link href={`/admin/products/${p.id}`} className="font-semibold text-forest-900 after:absolute after:inset-0 group-hover:underline">{p.name}</Link>
                            <div className="text-xs text-muted">/{p.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-ink-soft">{p.categoryName}</td>
                      <td className="px-3 py-3">
                        <div className="text-ink">{s.active.map((v) => v.label).join(" · ") || "—"}</div>
                        <div className="text-xs tabular-nums text-muted">{s.priceText}</div>
                      </td>
                      <td className="px-3 py-3"><StockText s={s} /></td>
                      <td className="px-5 py-3"><Flags p={p} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
          <ul className="space-y-3 md:hidden">
            {products.map((p) => {
              const s = summary(p);
              return (
                <li key={p.id}>
                  <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-white p-3 shadow-[var(--shadow-card)]">
                    <Thumb src={p.imageUrl} alt={p.name} className="size-16 shrink-0 overflow-hidden rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-forest-900">{p.name}</p>
                      <p className="truncate text-xs text-muted">{p.categoryName} · {s.active.map((v) => v.label).join(", ") || "no sizes"} · {s.priceText}</p>
                      <p className="mt-0.5 text-xs"><StockText s={s} /></p>
                      <div className="mt-1.5"><Flags p={p} /></div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

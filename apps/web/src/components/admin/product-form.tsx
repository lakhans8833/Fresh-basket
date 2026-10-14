"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Plus, Trash2, X, Archive, Save, ExternalLink, Scale } from "lucide-react";
import { adminProductSchema, type AdminProductInput } from "@freshbasket/shared";
import { api, ApiError } from "@/lib/client/api";
import { Button } from "../ui/button";
import { Field, Input, Select, Textarea, inputClass } from "../ui/form";
import { Notice, Spinner } from "../ui/feedback";
import { useToast } from "../ui/toast";
import { cn } from "../ui/cn";
import { ProductImage } from "../product/product-image";
import { errorMessage, serverFieldErrors, uploadImage, useAdminData, validateImage } from "./use-admin-data";
import { AdminOnly } from "./admin-context";
import { inputToPaise, paiseToInput, parseIntOrNull } from "./money";
import { Card, CardHeader, ConfirmDialog, LoadError, LoadingRows, MoneyInput, PageHeader, Toggle } from "./ui";

interface LoadedProduct {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  description: string | null;
  highlights: string[];
  seasonal: boolean;
  featured: boolean;
  active: boolean;
  images: { url: string; alt: string | null }[];
  variants: { id: string; label: string; price: number; mrp: number | null; stock: number; active: boolean; hasOrders: boolean }[];
}
interface CategoryOpt { id: string; name: string; active: boolean }

type VariantRow = { key: string; id?: string; label: string; price: string; mrp: string; stock: string; active: boolean; hasOrders: boolean };
type ImageRow = { key: string; url: string; alt: string };

let keySeq = 0;
const k = () => `k${++keySeq}`;

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** "500 g" -> 500, "1 kg" -> 1000; null for "1 bunch". Mirrors public.pack_label_grams in SQL. */
export function labelGrams(label: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*(kg|kgs|kilo|kilograms?|g|gm|gms|grams?|gr)$/.exec(label.trim().toLowerCase());
  if (!m) return null;
  const n = Number(m[1]);
  return Math.round(m[2]!.startsWith("k") ? n * 1000 : n);
}

const STANDARD_GRAMS = [100, 250, 500, 1000];

/**
 * Adds rows for any missing 100 g / 250 g / 500 g / 1 kg size. When a row with a weight and price
 * exists, the new row's price/MRP are scaled from the nearest one (rounded up to the next rupee) and
 * its stock is copied; otherwise the price is left blank for the owner to fill in.
 */
function withStandardSizes(rows: VariantRow[]): VariantRow[] {
  const blank = (r: VariantRow) => !r.id && !r.label.trim() && !r.price.trim() && !r.mrp.trim();
  const kept = rows.filter((r) => !blank(r));
  const priced = kept
    .map((r) => ({ r, g: labelGrams(r.label), price: Number(r.price), mrp: r.mrp.trim() ? Number(r.mrp) : null }))
    .filter((x): x is { r: VariantRow; g: number; price: number; mrp: number | null } => !!x.g && x.r.price.trim() !== "" && Number.isFinite(x.price));
  const have = new Set(kept.map((r) => labelGrams(r.label)).filter(Boolean));
  const scale = (v: number, from: number, to: number) => String(Math.ceil((v * to) / from));
  const added = STANDARD_GRAMS.filter((g) => !have.has(g)).map((g): VariantRow => {
    const src = [...priced].sort((a, b) => Math.abs(a.g - g) - Math.abs(b.g - g) || a.g - b.g)[0];
    return {
      ...emptyVariant(),
      label: g >= 1000 ? `${g / 1000} kg` : `${g} g`,
      price: src ? scale(src.price, src.g, g) : "",
      mrp: src && src.mrp !== null && Number.isFinite(src.mrp) ? scale(src.mrp, src.g, g) : "",
      stock: src ? src.r.stock : "0",
    };
  });
  return [...kept, ...added]
    .sort((a, b) => (labelGrams(a.label) ?? Infinity) - (labelGrams(b.label) ?? Infinity))
    .slice(0, 10);
}

const emptyVariant = (): VariantRow => ({ key: k(), label: "", price: "", mrp: "", stock: "0", active: true, hasOrders: false });

export function ProductForm({ id }: { id: string | null }) {
  return (
    <AdminOnly>
      <ProductFormLoader id={id} />
    </AdminOnly>
  );
}

function ProductFormLoader({ id }: { id: string | null }) {
  const cats = useAdminData<{ categories: CategoryOpt[] }>("/api/admin/categories");
  const prod = useAdminData<{ product: LoadedProduct }>(id ? `/api/admin/products/${id}` : null);
  const [version, setVersion] = useState(0);
  const back = (
    <Link href="/admin/products" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-forest-800">
      <ArrowLeft className="size-4" aria-hidden /> All products
    </Link>
  );
  const err = cats.error ?? (id ? prod.error : null);
  if (err) return <>{back}<LoadError message={err} onRetry={() => { void cats.reload(); if (id) void prod.reload(); }} /></>;
  if (!cats.data || (id && !prod.data)) return <>{back}<div className="skeleton mb-6 h-10 w-72" /><LoadingRows rows={5} /></>;
  return (
    <ProductEditor
      key={`${id ?? "new"}-${version}`}
      back={back}
      categories={cats.data.categories}
      initial={id ? prod.data!.product : null}
      onSaved={async () => {
        await prod.reload();
        setVersion((v) => v + 1);
      }}
    />
  );
}

function ProductEditor({ initial, categories, back, onSaved }: { initial: LoadedProduct | null; categories: CategoryOpt[]; back: React.ReactNode; onSaved: () => Promise<void> }) {
  const router = useRouter();
  const toast = useToast();
  const isNew = !initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? categories.find((c) => c.active)?.id ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [highlights, setHighlights] = useState<string[]>(initial?.highlights ?? []);
  const [chip, setChip] = useState("");
  const [seasonal, setSeasonal] = useState(initial?.seasonal ?? false);
  const [featured, setFeatured] = useState(initial?.featured ?? false);
  const [active, setActive] = useState(initial?.active ?? true);
  const [images, setImages] = useState<ImageRow[]>(() => (initial?.images ?? []).map((i) => ({ key: k(), url: i.url, alt: i.alt ?? "" })));
  const [variants, setVariants] = useState<VariantRow[]>(() =>
    initial?.variants.length
      ? initial.variants.map((v) => ({ key: k(), id: v.id, label: v.label, price: paiseToInput(v.price), mrp: paiseToInput(v.mrp), stock: String(v.stock), active: v.active, hasOrders: v.hasOrders }))
      : [emptyVariant()],
  );
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const chipId = useId();

  // Mark dirty on any edit (cheap: every setter below goes through `touch`).
  const touch = () => setDirty(true);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  function onName(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
    touch();
  }

  function addChip() {
    const t = chip.trim().slice(0, 40);
    if (!t || highlights.length >= 6 || highlights.includes(t)) return;
    setHighlights([...highlights, t]);
    setChip("");
    touch();
  }
  function chipKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addChip();
    } else if (e.key === "Backspace" && chip === "" && highlights.length) {
      setHighlights(highlights.slice(0, -1));
      touch();
    }
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploadError(null);
    const list = Array.from(files).slice(0, Math.max(0, 8 - images.length));
    if (files.length > list.length) setUploadError("A product can have up to 8 photos.");
    const problems = list.map(validateImage).filter(Boolean) as string[];
    if (problems.length) setUploadError(problems.join(" "));
    const ok = list.filter((f) => !validateImage(f));
    setUploading((n) => n + ok.length);
    await Promise.all(
      ok.map(async (f) => {
        try {
          const url = await uploadImage(f);
          setImages((imgs) => [...imgs, { key: k(), url, alt: imgs.length === 0 ? name : "" }]);
          touch();
        } catch (e) {
          setUploadError(errorMessage(e, "Upload failed."));
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
    if (fileRef.current) fileRef.current.value = "";
  }

  function moveImage(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setImages(next);
    touch();
  }

  function setVariant(key: string, patch: Partial<VariantRow>) {
    setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)));
    touch();
  }

  function build(): { payload?: AdminProductInput; errs: Record<string, string> } {
    const errs: Record<string, string> = {};
    const vs = variants.map((v, i) => {
      const price = inputToPaise(v.price);
      const mrp = inputToPaise(v.mrp);
      const stock = parseIntOrNull(v.stock);
      if (price === null) errs[`variants.${i}.price`] = "Enter a price";
      else if (Number.isNaN(price)) errs[`variants.${i}.price`] = "Use a rupee amount like 32 or 32.50";
      if (mrp !== null && Number.isNaN(mrp)) errs[`variants.${i}.mrp`] = "Use a rupee amount";
      else if (mrp !== null && price !== null && !Number.isNaN(price) && mrp < price) errs[`variants.${i}.mrp`] = "MRP should be at least the price";
      if (stock === null || Number.isNaN(stock)) errs[`variants.${i}.stock`] = "Whole number";
      return { id: v.id, label: v.label, price: price ?? 0, mrp: mrp === null || Number.isNaN(mrp) ? null : mrp, stock: stock ?? 0, sortOrder: i, active: v.active };
    });
    const raw = {
      name, slug, categoryId, description: description.trim() || null, highlights, seasonal, featured, active,
      images: images.map((i) => ({ url: i.url, alt: i.alt.trim() || null })),
      variants: vs,
    };
    const r = adminProductSchema.safeParse(raw);
    if (!r.success) {
      for (const iss of r.error.issues) {
        const key = iss.path.join(".");
        if (!errs[key]) errs[key] = key === "categoryId" ? "Choose a category" : key === "name" ? "Enter a name (2–80 characters)" : iss.message;
      }
    }
    if (variants.length > 0 && !variants.some((v) => v.active)) errs.variants = "Keep at least one weight option active so customers can buy it.";
    return { payload: r.success && Object.keys(errs).length === 0 ? r.data : undefined, errs };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const { payload, errs } = build();
    setErrors(errs);
    if (!payload) {
      setFormError("Please fix the highlighted fields.");
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }
    setSaving(true);
    try {
      const r = await api<{ id: string }>(isNew ? "/api/admin/products" : `/api/admin/products/${initial!.id}`, { method: isNew ? "POST" : "PUT", json: payload });
      setDirty(false);
      toast(isNew ? "Product created" : "Product saved");
      if (isNew) router.replace(`/admin/products/${r.id}`);
      else await onSaved(); // reload so new weight options get their ids
    } catch (err) {
      const fe = serverFieldErrors(err);
      if (err instanceof ApiError && err.code === "DUPLICATE") fe.slug = "Another product already uses this URL slug.";
      setErrors(fe);
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!initial) return;
    setDeleting(true);
    try {
      const r = await api<{ archived: boolean }>(`/api/admin/products/${initial.id}`, { method: "DELETE" });
      setDirty(false);
      toast(r.archived ? "Product has past orders, so it was hidden instead" : "Product deleted");
      router.push("/admin/products");
    } catch (err) {
      setFormError(errorMessage(err));
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  const err = (key: string) => errors[key];
  const activeCats = categories.filter((c) => c.active || c.id === categoryId);

  return (
    <>
    <form ref={formRef} onSubmit={submit} noValidate>
      {back}
      <PageHeader
        title={isNew ? "New product" : name || "Edit product"}
        description={isNew ? "Add a vegetable with its photos and weight options." : undefined}
        actions={
          <>
            {!isNew && initial?.active ? (
              <a href={`/product/${initial.slug}`} target="_blank" rel="noopener" className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-ink-soft hover:bg-sage-100">
                <ExternalLink className="size-4" aria-hidden /> View in store
              </a>
            ) : null}
            <Button type="submit" loading={saving}><Save className="size-4" aria-hidden /> {isNew ? "Create product" : "Save changes"}</Button>
          </>
        }
      />
      {formError ? <Notice tone="error" className="mb-5">{formError}</Notice> : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem] xl:items-start">
        <div className="space-y-6">
          <Card aria-labelledby="basics-h">
            <CardHeader id="basics-h" title="Basics" />
            <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
              <Field label="Name" htmlFor="p-name" error={err("name")}>
                <Input id="p-name" value={name} onChange={(e) => onName(e.target.value)} maxLength={80} invalid={!!err("name")} placeholder="e.g. Tomato (Hybrid)" aria-describedby={err("name") ? "p-name-error" : undefined} />
              </Field>
              <Field label="URL slug" htmlFor="p-slug" error={err("slug")} hint={slugTouched ? <button type="button" className="font-medium text-leaf-600 hover:underline" onClick={() => { setSlugTouched(false); setSlug(slugify(name)); touch(); }}>Regenerate from name</button> : "Generated from the name"}>
                <div className="relative">
                  <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">/product/</span>
                  <Input id="p-slug" value={slug} onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-")); setSlugTouched(true); touch(); }} maxLength={60} invalid={!!err("slug")} className="pl-[4.6rem]" aria-describedby={err("slug") ? "p-slug-error" : undefined} />
                </div>
              </Field>
              <Field label="Category" htmlFor="p-cat" error={err("categoryId")} className="sm:col-span-2">
                <Select id="p-cat" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); touch(); }} aria-invalid={!!err("categoryId") || undefined}>
                  <option value="" disabled>Choose a category</option>
                  {activeCats.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.active ? "" : " (hidden)"}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Description" htmlFor="p-desc" error={err("description")} hint={`${description.length}/2000`} className="sm:col-span-2">
                <Textarea id="p-desc" value={description} onChange={(e) => { setDescription(e.target.value); touch(); }} maxLength={2000} placeholder="Where it's from, how it tastes, how to store it…" />
              </Field>
              <div className="sm:col-span-2">
                <label htmlFor={chipId} className="text-sm font-medium text-ink-soft">Highlights <span className="font-normal text-muted">({highlights.length}/6)</span></label>
                <div className={cn(inputClass, "mt-1.5 flex h-auto min-h-11 flex-wrap items-center gap-1.5 py-1.5")}>
                  {highlights.map((h, i) => (
                    <span key={h} className="inline-flex items-center gap-1 rounded-full bg-lime-100 py-1 pl-3 pr-1 text-sm text-forest-800">
                      {h}
                      <button type="button" aria-label={`Remove ${h}`} onClick={() => { setHighlights(highlights.filter((_, j) => j !== i)); touch(); }} className="grid size-5 place-items-center rounded-full hover:bg-lime-300">
                        <X className="size-3" aria-hidden />
                      </button>
                    </span>
                  ))}
                  {highlights.length < 6 ? (
                    <input
                      id={chipId}
                      value={chip}
                      onChange={(e) => setChip(e.target.value)}
                      onKeyDown={chipKey}
                      onBlur={addChip}
                      maxLength={40}
                      placeholder={highlights.length ? "Add another…" : "e.g. Farm fresh, Pesticide-free"}
                      className="min-w-[10rem] flex-1 bg-transparent py-1 text-[0.9375rem] outline-none placeholder:text-muted/70"
                    />
                  ) : null}
                </div>
                <p className="mt-1.5 text-[0.8125rem] text-muted">{err("highlights") ?? "Short points shown on the product page. Press Enter to add."}</p>
              </div>
            </div>
          </Card>

          <Card aria-labelledby="photos-h">
            <CardHeader
              id="photos-h"
              title="Photos"
              description="JPEG, PNG or WebP, up to 5 MB each. The first photo is the main one."
              actions={
                <>
                  <input ref={fileRef} id="p-files" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={images.length >= 8} loading={uploading > 0}>
                    {uploading === 0 ? <ImagePlus className="size-4" aria-hidden /> : null} {uploading > 0 ? "Uploading…" : "Add photos"}
                  </Button>
                </>
              }
            />
            <div className="p-5 sm:p-6">
              {uploadError ? <Notice tone="error" className="mb-4">{uploadError}</Notice> : null}
              {images.length === 0 && uploading === 0 ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-sage-200 bg-sage-50/60 px-4 py-10 text-center text-sm text-muted hover:border-leaf-400 hover:bg-lime-50"
                >
                  <ImagePlus className="size-7 text-forest-700/60" aria-hidden />
                  <span><span className="font-semibold text-forest-800">Upload photos</span> — products with real photos sell better</span>
                </button>
              ) : (
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {images.map((img, i) => (
                    <li key={img.key} className="overflow-hidden rounded-2xl border border-line bg-white">
                      <div className="relative">
                        <ProductImage src={img.url} alt={img.alt || name || "Product photo"} sizes="(min-width: 1024px) 240px, 50vw" className="aspect-[4/3] w-full" />
                        {i === 0 ? <span className="absolute left-2 top-2 rounded-full bg-forest-900/85 px-2 py-0.5 text-[0.6875rem] font-semibold text-white">Main photo</span> : null}
                      </div>
                      <div className="space-y-2 p-3">
                        <label className="sr-only" htmlFor={`alt-${img.key}`}>Alt text for photo {i + 1}</label>
                        <input
                          id={`alt-${img.key}`}
                          value={img.alt}
                          onChange={(e) => { setImages(images.map((x) => (x.key === img.key ? { ...x, alt: e.target.value } : x))); touch(); }}
                          maxLength={120}
                          placeholder="Describe the photo (alt text)"
                          className={cn(inputClass, "h-9 text-sm")}
                        />
                        <div className="flex items-center justify-between">
                          <div className="flex gap-1">
                            <IconBtn label={`Move photo ${i + 1} earlier`} disabled={i === 0} onClick={() => moveImage(i, -1)}><ArrowLeft className="size-4" aria-hidden /></IconBtn>
                            <IconBtn label={`Move photo ${i + 1} later`} disabled={i === images.length - 1} onClick={() => moveImage(i, 1)}><ArrowRight className="size-4" aria-hidden /></IconBtn>
                          </div>
                          <IconBtn label={`Remove photo ${i + 1}`} danger onClick={() => { setImages(images.filter((x) => x.key !== img.key)); touch(); }}><Trash2 className="size-4" aria-hidden /></IconBtn>
                        </div>
                      </div>
                    </li>
                  ))}
                  {Array.from({ length: uploading }, (_, i) => (
                    <li key={`up-${i}`} className="grid aspect-[4/3] place-items-center rounded-2xl border border-dashed border-sage-200 bg-sage-50 text-muted">
                      <span className="flex items-center gap-2 text-sm"><Spinner className="size-4" /> Uploading…</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card aria-labelledby="variants-h">
            <CardHeader id="variants-h" title="Weight options" description="Each option has its own price and stock. Prices in rupees." />
            <div className="p-5 sm:p-6">
              {err("variants") ? <Notice tone="error" className="mb-4">{err("variants")}</Notice> : null}
              <div className="hidden grid-cols-[minmax(7rem,1.2fr)_1fr_1fr_0.8fr_auto_auto] gap-3 px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-muted md:grid">
                <span>Label</span><span>Price</span><span>MRP <span className="normal-case tracking-normal">(optional)</span></span><span>Stock</span><span>Active</span><span className="sr-only">Remove</span>
              </div>
              <ul className="space-y-3">
                {variants.map((v, i) => {
                  const e = (f: string) => err(`variants.${i}.${f}`);
                  return (
                    <li key={v.key} className="grid grid-cols-2 gap-3 rounded-2xl border border-line bg-sage-50/50 p-3 md:grid-cols-[minmax(7rem,1.2fr)_1fr_1fr_0.8fr_auto_auto] md:items-start md:border-0 md:bg-transparent md:p-1">
                      <VCell label="Label" id={`v-label-${v.key}`} error={e("label") ? "Enter a label like “500 g”" : undefined} className="col-span-2 md:col-span-1">
                        <Input id={`v-label-${v.key}`} value={v.label} onChange={(ev) => setVariant(v.key, { label: ev.target.value })} maxLength={30} placeholder="500 g" invalid={!!e("label")} />
                      </VCell>
                      <VCell label="Price" id={`v-price-${v.key}`} error={e("price")}>
                        <MoneyInput id={`v-price-${v.key}`} value={v.price} onChange={(ev) => setVariant(v.key, { price: ev.target.value })} placeholder="32" invalid={!!e("price")} />
                      </VCell>
                      <VCell label="MRP (optional)" id={`v-mrp-${v.key}`} error={e("mrp")}>
                        <MoneyInput id={`v-mrp-${v.key}`} value={v.mrp} onChange={(ev) => setVariant(v.key, { mrp: ev.target.value })} placeholder="—" invalid={!!e("mrp")} />
                      </VCell>
                      <VCell label="Stock" id={`v-stock-${v.key}`} error={e("stock")}>
                        <Input id={`v-stock-${v.key}`} inputMode="numeric" value={v.stock} onChange={(ev) => setVariant(v.key, { stock: ev.target.value.replace(/[^\d]/g, "") })} invalid={!!e("stock")} className="tabular-nums" />
                      </VCell>
                      <div className="flex items-center md:h-11">
                        <Toggle checked={v.active} onChange={(val) => setVariant(v.key, { active: val })} label={<span className="md:sr-only">Active</span>} id={`v-active-${v.key}`} />
                      </div>
                      <div className="flex items-center justify-end md:h-11">
                        <IconBtn
                          label={`Remove ${v.label || `option ${i + 1}`}`}
                          danger
                          disabled={variants.length === 1}
                          onClick={() => { setVariants(variants.filter((x) => x.key !== v.key)); touch(); }}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </IconBtn>
                      </div>
                      {v.hasOrders ? <p className="col-span-2 -mt-1 text-xs text-muted md:col-span-6">Has past orders — removing it will hide it instead of deleting it.</p> : null}
                    </li>
                  );
                })}
              </ul>
              <Button type="button" variant="outline" size="sm" className="mt-4" disabled={variants.length >= 10} onClick={() => { setVariants([...variants, emptyVariant()]); touch(); }}>
                <Plus className="size-4" aria-hidden /> Add weight option
              </Button>
              <Button type="button" variant="outline" size="sm" className="ml-2 mt-4" onClick={() => { setVariants(withStandardSizes(variants)); touch(); }}>
                <Scale className="size-4" aria-hidden /> Add 100 g, 250 g, 500 g, 1 kg
              </Button>
              <p className="mt-2 text-xs text-muted">New sizes are priced from your nearest existing size (per-gram rate, rounded up to the next rupee). Check prices and stock before saving.</p>
            </div>
          </Card>
        </div>

        <div className="space-y-6 xl:sticky xl:top-6">
          <Card aria-labelledby="vis-h" className="p-5">
            <h2 id="vis-h" className="text-lg font-semibold text-forest-900">Visibility</h2>
            <div className="mt-4 space-y-4">
              <Toggle checked={active} onChange={(v) => { setActive(v); touch(); }} label="Active" description="Shown in the store and can be ordered." />
              <Toggle checked={featured} onChange={(v) => { setFeatured(v); touch(); }} label="Featured" description="Appears in the home page picks." />
              <Toggle checked={seasonal} onChange={(v) => { setSeasonal(v); touch(); }} label="Seasonal" description="Tagged as in season right now." />
            </div>
          </Card>
          <div className="flex flex-col gap-2">
            <Button type="submit" loading={saving} className="w-full"><Save className="size-4" aria-hidden /> {isNew ? "Create product" : "Save changes"}</Button>
            {!isNew ? (
              <Button type="button" variant="danger" className="w-full" onClick={() => setConfirmDelete(true)}>
                <Archive className="size-4" aria-hidden /> Delete product
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </form>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${initial?.name ?? "product"}?`}
        tone="danger"
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      >
        If this product appears in past orders it will be hidden from the store instead, so order history stays intact. Otherwise it&apos;s removed permanently.
      </ConfirmDialog>
    </>
  );
}

function VCell({ label, id, error, children, className }: { label: string; id: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="text-xs font-medium text-muted md:sr-only">{label}</label>
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn("grid size-9 place-items-center rounded-full border border-line bg-white transition-colors disabled:opacity-35", danger ? "text-danger hover:bg-danger-bg" : "text-ink-soft hover:bg-sage-100")}
    >
      {children}
    </button>
  );
}

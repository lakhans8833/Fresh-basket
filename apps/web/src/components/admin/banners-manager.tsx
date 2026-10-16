"use client";

import { useRef, useState } from "react";
import { GalleryHorizontalEnd, ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { adminBannerSchema, BANNER_THEMES, type PromoBanner } from "@freshbasket/shared";
import { api } from "@/lib/client/api";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/form";
import { EmptyState, Notice } from "../ui/feedback";
import { useToast } from "../ui/toast";
import { cn } from "../ui/cn";
import { PromoCard } from "../home/promo-strip";
import { errorMessage, serverFieldErrors, uploadImage, useAdminData } from "./use-admin-data";
import { AdminOnly } from "./admin-context";
import { Badge, ConfirmDialog, EditorDialog, LoadError, LoadingRows, PageHeader, Toggle, useEditorDialogBusy, type EditorDialogHandle } from "./ui";

interface Banner extends PromoBanner {
  active: boolean;
  sortOrder: number;
  startsAt: string | null;
  endsAt: string | null;
  live: boolean;
}

const THEME_LABEL: Record<PromoBanner["theme"], string> = { green: "Green", lime: "Light green", amber: "Warm", ivory: "White" };
const THEME_SWATCH: Record<PromoBanner["theme"], string> = { green: "bg-forest-800", lime: "bg-lime-100", amber: "bg-[#fdf1dc]", ivory: "bg-white" };

/** Common places a banner can open; any other page on the site can be typed in. */
const LINK_SUGGESTIONS = [
  { value: "/deals", label: "Deals & offers" },
  { value: "/shop", label: "All products" },
  { value: "/shop?seasonal=1", label: "In season now" },
  { value: "/categories", label: "All categories" },
  { value: "/shop?price=lt20", label: "Under ₹20" },
];

// datetime-local <-> ISO (the browser's local time, i.e. IST for the store owner)
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);
const fmt = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function BannersManager() {
  return (
    <AdminOnly>
      <Inner />
    </AdminOnly>
  );
}

function Inner() {
  const toast = useToast();
  const { data, error, reload } = useAdminData<{ banners: Banner[] }>("/api/admin/banners");
  const [editing, setEditing] = useState<Banner | "new" | null>(null);
  const editorRef1 = useRef<EditorDialogHandle>(null);
  const [deleting, setDeleting] = useState<Banner | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const banners = data?.banners ?? [];

  async function doDelete() {
    if (!deleting) return;
    setBusyDelete(true);
    try {
      await api(`/api/admin/banners/${deleting.id}`, { method: "DELETE" });
      toast("Banner deleted");
      await reload();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusyDelete(false);
      setDeleting(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Banners"
        description="Offer banners in a strip under the home page slideshow. With no banners here, the home page shows automatic ones built from your real deals, combos and seasonal products."
        actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Add banner</Button>}
      />
      {error && !data ? (
        <LoadError message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingRows rows={3} />
      ) : banners.length === 0 ? (
        <EmptyState icon={<GalleryHorizontalEnd className="size-7" aria-hidden />} title="No banners yet" action={<Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Add banner</Button>}>
          Add a banner for an offer, a new category or a seasonal promotion.
        </EmptyState>
      ) : (
        <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {banners.map((b) => (
            <li key={b.id} className="space-y-2.5">
              <PromoCard banner={b} asPreview />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted">
                  {b.live ? <Badge tone="green">Showing now</Badge> : b.active ? <Badge tone="amber">Scheduled / ended</Badge> : <Badge tone="red">Hidden</Badge>}
                  <Badge tone={b.placement === "hero" ? "dark" : "neutral"}>{b.placement === "hero" ? "Hero slider" : "Offer strip"}</Badge>
                  <span>→ {b.linkUrl}</span>
                  <span>· sort {b.sortOrder}</span>
                  {b.startsAt ? <span>· from {fmt(b.startsAt)}</span> : null}
                  {b.endsAt ? <span>· until {fmt(b.endsAt)}</span> : null}
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setEditing(b)} aria-label={`Edit ${b.title}`}><Pencil className="size-3.5" aria-hidden /> Edit</Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleting(b)} aria-label={`Delete ${b.title}`}><Trash2 className="size-3.5" aria-hidden /></Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <EditorDialog controlRef={editorRef1} open={editing !== null} title={editing === "new" ? "New banner" : `Edit “${editing?.title ?? ""}”`} onClose={() => setEditing(null)}>
        {editing !== null ? (
          <BannerForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? null : editing}
            nextSort={(banners.reduce((m, b) => Math.max(m, b.sortOrder), 0) || 0) + 1}
            onCancel={() => editorRef1.current?.requestClose()}
            onSaved={async (created) => {
              toast(created ? "Banner created" : "Banner saved");
              setEditing(null);
              await reload();
            }}
          />
        ) : null}
      </EditorDialog>

      <ConfirmDialog open={deleting !== null} title={`Delete “${deleting?.title ?? ""}”?`} tone="danger" confirmLabel="Delete" busy={busyDelete} onConfirm={doDelete} onClose={() => setDeleting(null)}>
        This can&apos;t be undone. To hide it for now, edit it and switch off “Show on home page”.
      </ConfirmDialog>
    </>
  );
}

function BannerForm({ initial, nextSort, onCancel, onSaved }: { initial: Banner | null; nextSort: number; onCancel: () => void; onSaved: (created: boolean) => Promise<void> }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? "");
  const [linkUrl, setLinkUrl] = useState(initial?.linkUrl ?? "/deals");
  const [theme, setTheme] = useState<PromoBanner["theme"]>(initial?.theme ?? "green");
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [active, setActive] = useState(initial?.active ?? true);
  const [placement, setPlacement] = useState<"strip" | "hero">(initial?.placement ?? "strip");
  const [badge, setBadge] = useState(initial?.badge ?? "");
  const [ctaLabel, setCtaLabel] = useState(initial?.ctaLabel ?? "");
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? nextSort));
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt ?? null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEditorDialogBusy(saving);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setUploading(true);
    setFormError(null);
    try {
      setImageUrl(await uploadImage(f));
    } catch (e) {
      setFormError(errorMessage(e, "Upload failed."));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const raw = {
      title, subtitle: subtitle.trim() || null, imageUrl, linkUrl: linkUrl.trim(), theme, active,
      placement, badge: placement === "hero" ? badge.trim() || null : null, ctaLabel: placement === "hero" ? ctaLabel.trim() || null : null,
      sortOrder: /^\d+$/.test(sortOrder) ? Number(sortOrder) : -1,
      startsAt: fromLocalInput(startsAt), endsAt: fromLocalInput(endsAt),
    };
    const r = adminBannerSchema.safeParse(raw);
    if (!r.success) {
      const errs: Record<string, string> = {};
      for (const i of r.error.issues) {
        const k = String(i.path[0]);
        errs[k] ??= k === "title" ? "Enter a title (2–60 characters)" : k === "sortOrder" ? "Whole number 0–999" : i.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api(initial ? `/api/admin/banners/${initial.id}` : "/api/admin/banners", { method: initial ? "PUT" : "POST", json: r.data });
      await onSaved(!initial);
    } catch (err) {
      setErrors(serverFieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {formError ? <Notice tone="error">{formError}</Notice> : null}
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink-soft">Preview</p>
        <div className="max-w-sm"><PromoCard banner={{ title, subtitle: subtitle || null, imageUrl, linkUrl, theme }} asPreview /></div>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-ink-soft">Where to show</legend>
        <div className="flex flex-wrap gap-2">
          {([["strip", "Offer strip (cards under the slider)"], ["hero", "Home hero slider (big slide)"]] as const).map(([v, label]) => (
            <label key={v} className={cn("flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lime-200", placement === v ? "border-forest-800 bg-lime-50" : "border-line")}>
              <input type="radio" name="placement" value={v} checked={placement === v} onChange={() => setPlacement(v)} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        {placement === "hero" ? <p className="mt-1.5 text-xs text-muted">Hero slides appear after the first slide and auto-play every 5 seconds. Use a wide photo (landscape).</p> : null}
      </fieldset>
      {placement === "hero" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Badge (optional)" htmlFor="b-badge" hint="Small label above the title, e.g. “This weekend”">
            <Input id="b-badge" value={badge} maxLength={40} onChange={(e) => setBadge(e.target.value)} />
          </Field>
          <Field label="Button text (optional)" htmlFor="b-cta" hint="Default: “Shop now”">
            <Input id="b-cta" value={ctaLabel} maxLength={30} onChange={(e) => setCtaLabel(e.target.value)} />
          </Field>
        </div>
      ) : null}
      <Field label="Title" htmlFor="b-title" error={errors.title} hint="Short and clear, e.g. “Fresh fruits — up to 20% off”. Only promise offers you have set up.">
        <Input id="b-title" value={title} maxLength={60} invalid={!!errors.title} autoFocus onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Subtitle" htmlFor="b-sub" error={errors.subtitle} hint="Optional, up to 120 characters">
        <Input id="b-sub" value={subtitle} maxLength={120} onChange={(e) => setSubtitle(e.target.value)} />
      </Field>
      <Field label="Opens page" htmlFor="b-link" error={errors.linkUrl} hint="A page on this website, starting with /">
        <Input id="b-link" value={linkUrl} maxLength={200} invalid={!!errors.linkUrl} list="b-link-options" onChange={(e) => setLinkUrl(e.target.value)} />
      </Field>
      <datalist id="b-link-options">
        {LINK_SUGGESTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </datalist>
      <div className="flex flex-wrap gap-1.5">
        {LINK_SUGGESTIONS.map((s) => (
          <button key={s.value} type="button" onClick={() => setLinkUrl(s.value)} className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", linkUrl === s.value ? "border-forest-800 bg-forest-800 text-white" : "border-line text-ink-soft hover:border-forest-700/40")}>
            {s.label}
          </button>
        ))}
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-ink-soft">Colour</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {BANNER_THEMES.map((t) => (
            <label key={t} className={cn("flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-lime-200", theme === t ? "border-forest-800" : "border-line")}>
              <input type="radio" name="theme" value={t} checked={theme === t} onChange={() => setTheme(t)} className="sr-only" />
              <span className={cn("size-4 rounded-full border border-line", THEME_SWATCH[t])} aria-hidden /> {THEME_LABEL[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <p className="text-sm font-medium text-ink-soft">Picture</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="b-file" onChange={(e) => onFile(e.target.files?.[0])} />
          <Button type="button" size="sm" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
            {!uploading ? <ImagePlus className="size-4" aria-hidden /> : null} {imageUrl ? "Replace" : "Upload"}
          </Button>
          {imageUrl ? <Button type="button" size="sm" variant="ghost" onClick={() => setImageUrl(null)}><X className="size-4" aria-hidden /> Remove</Button> : null}
        </div>
        <p className="mt-1.5 text-[0.8125rem] text-muted">JPEG, PNG or WebP up to 5 MB. Use your own photos or ones you have the right to use.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start showing (optional)" htmlFor="b-start" error={errors.startsAt}>
          <Input id="b-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field label="Stop showing (optional)" htmlFor="b-end" error={errors.endsAt}>
          <Input id="b-end" type="datetime-local" value={endsAt} invalid={!!errors.endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
        <Field label="Sort order" htmlFor="b-sort" error={errors.sortOrder} hint="Lower numbers show first">
          <Input id="b-sort" inputMode="numeric" value={sortOrder} invalid={!!errors.sortOrder} onChange={(e) => setSortOrder(e.target.value.replace(/[^\d]/g, ""))} />
        </Field>
        <div className="pb-2.5"><Toggle checked={active} onChange={setActive} label="Show on home page" /></div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving} disabled={uploading}>{initial ? "Save banner" : "Create banner"}</Button>
      </div>
    </form>
  );
}

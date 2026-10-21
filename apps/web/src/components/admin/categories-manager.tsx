"use client";

import { useRef, useState } from "react";
import { FolderTree, ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { adminCategorySchema } from "@freshbasket/shared";
import { api, ApiError } from "@/lib/client/api";
import { Button } from "../ui/button";
import { Field, Input, Textarea } from "../ui/form";
import { EmptyState, Notice } from "../ui/feedback";
import { useToast } from "../ui/toast";
import { ProductImage } from "../product/product-image";
import { errorMessage, serverFieldErrors, uploadImage, useAdminData } from "./use-admin-data";
import { AdminOnly } from "./admin-context";
import { slugify } from "./product-form";
import { Badge, Card, ConfirmDialog, EditorDialog, LoadError, LoadingRows, PageHeader, Thumb, Toggle, useEditorDialogBusy, useEditorDialogMarkDirty, type EditorDialogHandle } from "./ui";

interface Cat {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  active: boolean;
  productCount: number;
}

export function CategoriesManager() {
  return (
    <AdminOnly>
      <Inner />
    </AdminOnly>
  );
}

function Inner() {
  const toast = useToast();
  const { data, error, reload } = useAdminData<{ categories: Cat[] }>("/api/admin/categories");
  const [editing, setEditing] = useState<Cat | "new" | null>(null);
  const editorRef1 = useRef<EditorDialogHandle>(null);
  const [deleting, setDeleting] = useState<Cat | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const cats = data?.categories ?? [];

  async function doDelete() {
    if (!deleting) return;
    setBusyDelete(true);
    setListError(null);
    try {
      await api(`/api/admin/categories/${deleting.id}`, { method: "DELETE" });
      toast("Category deleted");
      await reload();
    } catch (e) {
      setListError(errorMessage(e));
    } finally {
      setBusyDelete(false);
      setDeleting(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Categories"
        description="Group products so customers can browse. Lower sort numbers appear first."
        actions={<Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Add category</Button>}
      />
      {listError ? <Notice tone="error" className="mb-5" title="Couldn't delete">{listError}</Notice> : null}
      {error && !data ? (
        <LoadError message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingRows rows={4} />
      ) : cats.length === 0 ? (
        <EmptyState icon={<FolderTree className="size-7" aria-hidden />} title="No categories yet" action={<Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Add category</Button>}>
          Create at least one category before adding products.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {cats.map((c) => (
            <li key={c.id}>
              <Card className="flex h-full flex-col overflow-hidden">
                <ProductImage src={c.imageUrl} alt={c.name} sizes="(min-width: 1280px) 360px, (min-width: 640px) 50vw, 100vw" className="aspect-[16/7] w-full" />
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold text-forest-900">{c.name}</h2>
                      <p className="text-xs text-muted">/{c.slug} · sort {c.sortOrder}</p>
                    </div>
                    {c.active ? <Badge tone="green">Visible</Badge> : <Badge tone="red">Hidden</Badge>}
                  </div>
                  {c.description ? <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{c.description}</p> : null}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                    <span className="text-sm text-muted">{c.productCount} product{c.productCount === 1 ? "" : "s"}</span>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setEditing(c)} aria-label={`Edit ${c.name}`}><Pencil className="size-3.5" aria-hidden /> Edit</Button>
                      <Button size="sm" variant="danger" onClick={() => { setListError(null); setDeleting(c); }} aria-label={`Delete ${c.name}`}><Trash2 className="size-3.5" aria-hidden /></Button>
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <EditorDialog controlRef={editorRef1} open={editing !== null} title={editing === "new" ? "New category" : `Edit ${editing?.name ?? ""}`} onClose={() => setEditing(null)}>
        {editing !== null ? (
          <CategoryForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? null : editing}
            nextSort={(cats.reduce((m, c) => Math.max(m, c.sortOrder), 0) || 0) + 1}
            onCancel={() => editorRef1.current?.requestClose()}
            onSaved={async (created) => {
              toast(created ? "Category created" : "Category saved");
              setEditing(null);
              await reload();
            }}
          />
        ) : null}
      </EditorDialog>

      <ConfirmDialog open={deleting !== null} title={`Delete ${deleting?.name ?? ""}?`} tone="danger" confirmLabel="Delete" busy={busyDelete} onConfirm={doDelete} onClose={() => setDeleting(null)}>
        {deleting && deleting.productCount > 0
          ? `This category still has ${deleting.productCount} product${deleting.productCount === 1 ? "" : "s"}, so the store will refuse. Move them first, or just hide the category.`
          : "This can't be undone."}
      </ConfirmDialog>
    </>
  );
}

function CategoryForm({ initial, nextSort, onCancel, onSaved }: { initial: Cat | null; nextSort: number; onCancel: () => void; onSaved: (created: boolean) => Promise<void> }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(!!initial);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? nextSort));
  const [active, setActive] = useState(initial?.active ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEditorDialogBusy(saving);
  const markDirty = useEditorDialogMarkDirty();
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
    const raw = { name, slug, description: description.trim() || null, imageUrl, sortOrder: /^\d+$/.test(sortOrder) ? Number(sortOrder) : -1, active };
    const r = adminCategorySchema.safeParse(raw);
    if (!r.success) {
      const errs: Record<string, string> = {};
      for (const i of r.error.issues) {
        const k = String(i.path[0]);
        errs[k] ??= k === "name" ? "Enter a name (2–60 characters)" : k === "sortOrder" ? "Whole number 0–999" : i.message;
      }
      setErrors(errs);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api(initial ? `/api/admin/categories/${initial.id}` : "/api/admin/categories", { method: initial ? "PUT" : "POST", json: r.data });
      await onSaved(!initial);
    } catch (err) {
      const fe = serverFieldErrors(err);
      if (err instanceof ApiError && err.code === "DUPLICATE") fe.slug = "Another category already uses this slug.";
      setErrors(fe);
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {formError ? <Notice tone="error">{formError}</Notice> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="c-name" error={errors.name}>
          <Input id="c-name" value={name} maxLength={60} invalid={!!errors.name} autoFocus onChange={(e) => { setName(e.target.value); if (!slugTouched) setSlug(slugify(e.target.value)); }} />
        </Field>
        <Field label="Slug" htmlFor="c-slug" error={errors.slug} hint="Used in the store URL">
          <Input id="c-slug" value={slug} maxLength={60} invalid={!!errors.slug} onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-")); setSlugTouched(true); }} />
        </Field>
      </div>
      <Field label="Description" htmlFor="c-desc" error={errors.description} hint="Optional, up to 200 characters">
        <Textarea id="c-desc" value={description} maxLength={200} className="min-h-20" onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div>
        <p className="text-sm font-medium text-ink-soft">Image</p>
        <div className="mt-1.5 flex items-center gap-3">
          <Thumb src={imageUrl} alt={name || "Category"} className="h-16 w-28 shrink-0 overflow-hidden rounded-xl" />
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" id="c-file" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button type="button" size="sm" variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
              {!uploading ? <ImagePlus className="size-4" aria-hidden /> : null} {imageUrl ? "Replace" : "Upload"}
            </Button>
            {imageUrl ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => { setImageUrl(null); markDirty(); }}><X className="size-4" aria-hidden /> Remove</Button>
            ) : null}
          </div>
        </div>
        <p className="mt-1.5 text-[0.8125rem] text-muted">JPEG, PNG or WebP up to 5 MB.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 sm:items-end">
        <Field label="Sort order" htmlFor="c-sort" error={errors.sortOrder}>
          <Input id="c-sort" inputMode="numeric" value={sortOrder} invalid={!!errors.sortOrder} onChange={(e) => setSortOrder(e.target.value.replace(/[^\d]/g, ""))} />
        </Field>
        <div className="pb-2.5"><Toggle checked={active} onChange={setActive} label="Visible in store" /></div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving} disabled={uploading}>{initial ? "Save category" : "Create category"}</Button>
      </div>
    </form>
  );
}

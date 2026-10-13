"use client";

import { useState } from "react";
import { Pencil, Plus, TicketPercent, Trash2 } from "lucide-react";
import { adminCouponSchema, formatINR } from "@freshbasket/shared";
import { api, ApiError } from "@/lib/client/api";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/form";
import { EmptyState, Notice } from "../ui/feedback";
import { useToast } from "../ui/toast";
import { cn } from "../ui/cn";
import { errorMessage, serverFieldErrors, useAdminData } from "./use-admin-data";
import { AdminOnly } from "./admin-context";
import { inputToPaise, paiseToInput, parseIntOrNull } from "./money";
import { Badge, Card, ConfirmDialog, EditorDialog, LoadError, LoadingRows, MoneyInput, PageHeader, Toggle, formatDateTime } from "./ui";

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  kind: "percent" | "flat";
  value: number;
  minOrder: number;
  maxDiscount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  active: boolean;
}

function status(c: Coupon): { label: string; tone: "green" | "amber" | "red" | "neutral" } {
  const now = Date.now();
  if (!c.active) return { label: "Off", tone: "neutral" };
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return { label: "Expired", tone: "red" };
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit) return { label: "Used up", tone: "red" };
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return { label: "Scheduled", tone: "amber" };
  return { label: "Live", tone: "green" };
}

function valueText(c: Coupon) {
  return c.kind === "percent" ? `${c.value}% off${c.maxDiscount ? ` (max ${formatINR(c.maxDiscount)})` : ""}` : `${formatINR(c.value)} off`;
}

/** ISO timestamp → value for <input type="datetime-local"> in the browser's time zone. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(s: string) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function CouponsManager() {
  return (
    <AdminOnly>
      <Inner />
    </AdminOnly>
  );
}

function Inner() {
  const toast = useToast();
  const { data, error, reload } = useAdminData<{ coupons: Coupon[] }>("/api/admin/coupons");
  const [editing, setEditing] = useState<Coupon | "new" | null>(null);
  const [deleting, setDeleting] = useState<Coupon | null>(null);
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const coupons = data?.coupons ?? [];

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/admin/coupons/${deleting.id}`, { method: "DELETE" });
      toast(deleting.usedCount > 0 ? "Coupon has been used, so it was turned off" : "Coupon deleted");
      await reload();
    } catch (e) {
      setListError(errorMessage(e));
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  const newBtn = <Button onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> New coupon</Button>;

  return (
    <>
      <PageHeader title="Coupons" description="Discount codes customers enter at checkout. Discounts are always re-checked by the server." actions={newBtn} />
      {listError ? <Notice tone="error" className="mb-5">{listError}</Notice> : null}
      {error && !data ? (
        <LoadError message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingRows rows={4} />
      ) : coupons.length === 0 ? (
        <EmptyState icon={<TicketPercent className="size-7" aria-hidden />} title="No coupons yet" action={newBtn}>
          Create a welcome offer or a festival discount.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {coupons.map((c) => {
            const st = status(c);
            const pct = c.usageLimit ? Math.min(100, Math.round((c.usedCount / c.usageLimit) * 100)) : null;
            return (
              <li key={c.id}>
                <Card className={cn("flex h-full flex-col p-5", st.tone === "neutral" && "bg-sage-50/60")}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="inline-block rounded-lg border border-dashed border-forest-700/40 bg-lime-50 px-2.5 py-1 font-mono text-[0.9375rem] font-bold tracking-wider text-forest-900">{c.code}</p>
                      <p className="mt-2 font-semibold text-ink">{valueText(c)}</p>
                      {c.description ? <p className="text-sm text-muted">{c.description}</p> : null}
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <dt className="text-muted">Min. order</dt><dd className="text-right tabular-nums">{c.minOrder ? formatINR(c.minOrder) : "—"}</dd>
                    <dt className="text-muted">Per customer</dt><dd className="text-right">{c.perUserLimit ? `${c.perUserLimit}×` : "Unlimited"}</dd>
                    {c.startsAt ? <><dt className="text-muted">Starts</dt><dd className="text-right">{formatDateTime(c.startsAt)}</dd></> : null}
                    {c.endsAt ? <><dt className="text-muted">Ends</dt><dd className="text-right">{formatDateTime(c.endsAt)}</dd></> : null}
                  </dl>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-muted">
                      <span>Used</span>
                      <span className="tabular-nums">{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : " · no limit"}</span>
                    </div>
                    {pct !== null ? (
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sage-100" role="progressbar" aria-valuenow={c.usedCount} aria-valuemin={0} aria-valuemax={c.usageLimit ?? undefined} aria-label={`${c.code} usage`}>
                        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-danger" : "bg-leaf-500")} style={{ width: `${pct}%` }} />
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-auto flex justify-end gap-1.5 pt-4">
                    <Button size="sm" variant="outline" onClick={() => setEditing(c)} aria-label={`Edit ${c.code}`}><Pencil className="size-3.5" aria-hidden /> Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => { setListError(null); setDeleting(c); }} aria-label={`Delete ${c.code}`}><Trash2 className="size-3.5" aria-hidden /></Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <EditorDialog wide open={editing !== null} title={editing === "new" ? "New coupon" : `Edit ${editing?.code ?? ""}`} onClose={() => setEditing(null)}>
        {editing !== null ? (
          <CouponForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={async (created) => {
              toast(created ? "Coupon created" : "Coupon saved");
              setEditing(null);
              await reload();
            }}
          />
        ) : null}
      </EditorDialog>
      <ConfirmDialog open={deleting !== null} title={`Delete ${deleting?.code ?? ""}?`} tone="danger" confirmLabel={deleting?.usedCount ? "Turn off" : "Delete"} busy={busy} onConfirm={doDelete} onClose={() => setDeleting(null)}>
        {deleting?.usedCount ? "This code has been used on orders, so it will be turned off instead of deleted." : "The code will stop working immediately."}
      </ConfirmDialog>
    </>
  );
}

function CouponForm({ initial, onCancel, onSaved }: { initial: Coupon | null; onCancel: () => void; onSaved: (created: boolean) => Promise<void> }) {
  const [f, setF] = useState({
    code: initial?.code ?? "",
    description: initial?.description ?? "",
    kind: initial?.kind ?? ("percent" as "percent" | "flat"),
    value: initial ? (initial.kind === "percent" ? String(initial.value) : paiseToInput(initial.value)) : "",
    minOrder: paiseToInput(initial?.minOrder ?? 0),
    maxDiscount: paiseToInput(initial?.maxDiscount),
    startsAt: toLocalInput(initial?.startsAt ?? null),
    endsAt: toLocalInput(initial?.endsAt ?? null),
    usageLimit: initial?.usageLimit ? String(initial.usageLimit) : "",
    perUserLimit: initial?.perUserLimit ? String(initial.perUserLimit) : "",
    active: initial?.active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errs: Record<string, string> = {};
    let value: number;
    if (f.kind === "percent") {
      const v = parseIntOrNull(f.value);
      value = v ?? 0;
      if (v === null || Number.isNaN(v) || v < 1 || v > 100) errs.value = "Whole percent from 1 to 100";
    } else {
      const v = inputToPaise(f.value);
      value = v ?? 0;
      if (v === null || Number.isNaN(v) || v < 100) errs.value = "Enter at least ₹1";
    }
    const minOrder = inputToPaise(f.minOrder);
    if (minOrder !== null && Number.isNaN(minOrder)) errs.minOrder = "Use a rupee amount";
    const maxDiscount = f.kind === "percent" ? inputToPaise(f.maxDiscount) : null;
    if (maxDiscount !== null && Number.isNaN(maxDiscount)) errs.maxDiscount = "Use a rupee amount, or leave empty";
    const usageLimit = parseIntOrNull(f.usageLimit);
    if (usageLimit !== null && (Number.isNaN(usageLimit) || usageLimit < 1)) errs.usageLimit = "At least 1, or leave empty";
    const perUserLimit = parseIntOrNull(f.perUserLimit);
    if (perUserLimit !== null && (Number.isNaN(perUserLimit) || perUserLimit < 1)) errs.perUserLimit = "At least 1, or leave empty";
    const startsAt = fromLocalInput(f.startsAt);
    const endsAt = fromLocalInput(f.endsAt);
    if (startsAt && endsAt && endsAt <= startsAt) errs.endsAt = "Must be after the start";

    const r = adminCouponSchema.safeParse({
      code: f.code, description: f.description.trim() || null, kind: f.kind, value,
      minOrder: minOrder === null || Number.isNaN(minOrder) ? 0 : minOrder,
      maxDiscount: maxDiscount === null || Number.isNaN(maxDiscount) ? null : maxDiscount,
      startsAt, endsAt,
      usageLimit: usageLimit === null || Number.isNaN(usageLimit) ? null : usageLimit,
      perUserLimit: perUserLimit === null || Number.isNaN(perUserLimit) ? null : perUserLimit,
      active: f.active,
    });
    if (!r.success) for (const i of r.error.issues) errs[String(i.path[0])] ??= i.message;
    setErrors(errs);
    if (!r.success || Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api(initial ? `/api/admin/coupons/${initial.id}` : "/api/admin/coupons", { method: initial ? "PUT" : "POST", json: r.data });
      await onSaved(!initial);
    } catch (err) {
      const fe = serverFieldErrors(err);
      if (err instanceof ApiError && err.code === "DUPLICATE") fe.code = "A coupon with this code already exists.";
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
        <Field label="Code" htmlFor="cp-code" error={errors.code} hint="Letters and numbers, 3–32">
          <Input id="cp-code" value={f.code} maxLength={32} autoFocus invalid={!!errors.code} className="font-mono uppercase tracking-wider" onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="FRESH10" />
        </Field>
        <Field label="Description" htmlFor="cp-desc" error={errors.description} hint="Shown to customers">
          <Input id="cp-desc" value={f.description} maxLength={160} onChange={(e) => set({ description: e.target.value })} placeholder="10% off orders above ₹199" />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ink-soft">Discount type</legend>
        <div className="mt-1.5 inline-flex rounded-full border border-line bg-white p-1">
          {(["percent", "flat"] as const).map((k) => (
            <label key={k} className={cn("cursor-pointer rounded-full px-4 py-1.5 text-sm font-medium has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-leaf-500", f.kind === k ? "bg-forest-800 text-white" : "text-ink-soft hover:bg-sage-100")}>
              <input type="radio" name="cp-kind" value={k} checked={f.kind === k} onChange={() => set({ kind: k, value: "" })} className="sr-only" />
              {k === "percent" ? "Percentage" : "Flat amount"}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={f.kind === "percent" ? "Percent off" : "Amount off"} htmlFor="cp-value" error={errors.value}>
          {f.kind === "percent" ? (
            <div className="relative">
              <Input id="cp-value" inputMode="numeric" value={f.value} invalid={!!errors.value} className="pr-8 tabular-nums" onChange={(e) => set({ value: e.target.value.replace(/[^\d]/g, "") })} placeholder="10" />
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted">%</span>
            </div>
          ) : (
            <MoneyInput id="cp-value" value={f.value} invalid={!!errors.value} onChange={(e) => set({ value: e.target.value })} placeholder="50" />
          )}
        </Field>
        <Field label="Minimum order" htmlFor="cp-min" error={errors.minOrder}>
          <MoneyInput id="cp-min" value={f.minOrder} invalid={!!errors.minOrder} onChange={(e) => set({ minOrder: e.target.value })} />
        </Field>
        {f.kind === "percent" ? (
          <Field label="Max discount" htmlFor="cp-max" error={errors.maxDiscount} hint="Optional cap">
            <MoneyInput id="cp-max" value={f.maxDiscount} invalid={!!errors.maxDiscount} onChange={(e) => set({ maxDiscount: e.target.value })} placeholder="—" />
          </Field>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts" htmlFor="cp-start" error={errors.startsAt} hint="Optional — leave empty to start now">
          <Input id="cp-start" type="datetime-local" value={f.startsAt} onChange={(e) => set({ startsAt: e.target.value })} />
        </Field>
        <Field label="Ends" htmlFor="cp-end" error={errors.endsAt} hint="Optional">
          <Input id="cp-end" type="datetime-local" value={f.endsAt} invalid={!!errors.endsAt} onChange={(e) => set({ endsAt: e.target.value })} />
        </Field>
        <Field label="Total uses" htmlFor="cp-limit" error={errors.usageLimit} hint="Empty = unlimited">
          <Input id="cp-limit" inputMode="numeric" value={f.usageLimit} invalid={!!errors.usageLimit} onChange={(e) => set({ usageLimit: e.target.value.replace(/[^\d]/g, "") })} />
        </Field>
        <Field label="Uses per customer" htmlFor="cp-peruser" error={errors.perUserLimit} hint="Empty = unlimited">
          <Input id="cp-peruser" inputMode="numeric" value={f.perUserLimit} invalid={!!errors.perUserLimit} onChange={(e) => set({ perUserLimit: e.target.value.replace(/[^\d]/g, "") })} />
        </Field>
      </div>
      <Toggle checked={f.active} onChange={(v) => set({ active: v })} label="Active" description="Customers can apply this code at checkout." />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>{initial ? "Save coupon" : "Create coupon"}</Button>
      </div>
    </form>
  );
}

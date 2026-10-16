"use client";

import { useState } from "react";
import { MapPin, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { adminDeliveryAreaSchema, adminSlotSchema, effectiveMinOrder, formatINR, formatSlotTime } from "@freshbasket/shared";
import { api, ApiError } from "@/lib/client/api";
import { Button } from "../ui/button";
import { Field, Input } from "../ui/form";
import { Notice } from "../ui/feedback";
import { useToast } from "../ui/toast";
import { cn } from "../ui/cn";
import { errorMessage, serverFieldErrors, useAdminData } from "./use-admin-data";
import { AdminOnly } from "./admin-context";
import { inputToPaise, paiseToInput } from "./money";
import { Badge, Card, CardHeader, ConfirmDialog, EditorDialog, LoadError, LoadingRows, MoneyInput, PageHeader, Toggle } from "./ui";

interface Area { id: string; pincode: string; areaName: string; city: string; fee: number; freeAbove: number | null; minOrder: number; active: boolean }
interface Slot { id: string; label: string; startTime: string; endTime: string; cutoffMinutes: number; capacity: number; sortOrder: number; active: boolean }

export function DeliveryManager() {
  return (
    <AdminOnly>
      <PageHeader title="Delivery" description="Where you deliver, what it costs, and the time slots customers can pick." />
      <div className="space-y-8">
        <AreasSection />
        <SlotsSection />
      </div>
    </AdminOnly>
  );
}

function issuesToErrors(issues: { path: PropertyKey[]; message: string }[], labels: Record<string, string> = {}) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0]);
    out[k] ??= labels[k] ?? i.message;
  }
  return out;
}

/* ---------------- Areas ---------------- */

function AreasSection() {
  const toast = useToast();
  const { data, error, reload } = useAdminData<{
    areas: Area[];
    storeMinOrder?: number;
    serviceArea?: { name: string; state: string };
    mismatches?: { id: string; pincode: string; city: string; pinState: string }[];
  }>("/api/admin/delivery/areas");
  const storeMin = data?.storeMinOrder ?? 0;
  const mismatch = new Map((data?.mismatches ?? []).map((m) => [m.id, m]));
  /** What customers must actually order here: the higher of this area's minimum and the store-wide one. */
  const minText = (a: Area) => {
    const eff = effectiveMinOrder(a.minOrder, storeMin);
    if (!eff) return "None";
    return storeMin > a.minOrder ? `${formatINR(eff)} (store-wide)` : formatINR(eff);
  };
  const [editing, setEditing] = useState<Area | "new" | null>(null);
  const [deleting, setDeleting] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const areas = data?.areas ?? [];

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/admin/delivery/areas/${deleting.id}`, { method: "DELETE" });
      toast("Area removed");
      await reload();
    } catch (e) {
      setListError(errorMessage(e));
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  return (
    <Card aria-labelledby="areas-h">
      <CardHeader
        id="areas-h"
        title="Delivery areas"
        description="Only these PIN codes can check out. Turn an area off to pause deliveries there."
        actions={<Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Add area</Button>}
      />
      {listError ? <Notice tone="error" className="m-5">{listError}</Notice> : null}
      {data ? (
        <p className="border-b border-line px-5 py-3 text-sm text-ink-soft">
          <b>Minimum order rule:</b> customers must reach the <b>higher</b> of the area&apos;s own minimum and the store-wide minimum
          {storeMin ? <> (currently <b>{formatINR(storeMin)}</b>, set in <a href="/admin/settings" className="font-semibold text-leaf-600 underline">Settings</a>)</> : " (none set in Settings)"}. The Min. order column shows what customers see at checkout.
        </p>
      ) : null}
      {mismatch.size ? (
        <Notice tone="warning" className="m-5" title="Some active areas are outside your service area">
          Your store serves {data?.serviceArea?.name} ({data?.serviceArea?.state}), but {mismatch.size} active area{mismatch.size === 1 ? " has a PIN code" : "s have PIN codes"} in{" "}
          {[...new Set([...mismatch.values()].map((m) => m.pinState))].join(" / ")}. Customers there can currently check out. Please confirm which areas you really deliver to —
          nothing is paused or deleted automatically. (The service area name comes from NEXT_PUBLIC_SERVICE_AREA / NEXT_PUBLIC_DEFAULT_STATE.)
        </Notice>
      ) : null}
      {error && !data ? (
        <div className="p-5"><LoadError message={error} onRetry={reload} /></div>
      ) : !data ? (
        <LoadingRows rows={3} className="p-5" />
      ) : areas.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <MapPin className="size-7 text-forest-700/60" aria-hidden />
          <p className="mt-2 font-semibold text-forest-900">No delivery areas yet</p>
          <p className="text-sm text-muted">Customers can&apos;t check out until you add at least one PIN code.</p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-sage-50 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th scope="col" className="px-5 py-2.5 font-semibold">PIN code</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Area</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Fee</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Free above</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Min. order</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
                  <th scope="col" className="px-5 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {areas.map((a) => (
                  <tr key={a.id} className={cn(!a.active && "text-muted")}>
                    <td className="px-5 py-3 font-semibold tabular-nums text-forest-900">{a.pincode}</td>
                    <td className="px-3 py-3">{a.areaName}<span className="text-muted">, {a.city}</span>{mismatch.has(a.id) ? <span className="ml-2"><Badge tone="amber">PIN in {mismatch.get(a.id)!.pinState}</Badge></span> : null}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{a.fee ? formatINR(a.fee) : "Free"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{a.freeAbove !== null ? formatINR(a.freeAbove) : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{minText(a)}</td>
                    <td className="px-3 py-3">{a.active ? <Badge tone="green">Delivering</Badge> : <Badge>Paused</Badge>}</td>
                    <td className="px-5 py-3">
                      <RowActions name={`${a.areaName} (${a.pincode})`} onEdit={() => setEditing(a)} onDelete={() => { setListError(null); setDeleting(a); }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-line md:hidden">
            {areas.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="font-semibold text-forest-900"><span className="tabular-nums">{a.pincode}</span> · {a.areaName}</p>
                  <p className="text-sm text-muted">
                    Fee {a.fee ? formatINR(a.fee) : "free"}{a.freeAbove !== null ? `, free above ${formatINR(a.freeAbove)}` : ""} · min {minText(a)}
                  </p>
                  {mismatch.has(a.id) ? <div className="mt-1"><Badge tone="amber">PIN in {mismatch.get(a.id)!.pinState}</Badge></div> : null}
                  <div className="mt-1">{a.active ? <Badge tone="green">Delivering</Badge> : <Badge>Paused</Badge>}</div>
                </div>
                <RowActions name={`${a.areaName} (${a.pincode})`} onEdit={() => setEditing(a)} onDelete={() => { setListError(null); setDeleting(a); }} />
              </li>
            ))}
          </ul>
        </>
      )}

      <EditorDialog open={editing !== null} title={editing === "new" ? "New delivery area" : "Edit delivery area"} onClose={() => setEditing(null)}>
        {editing !== null ? (
          <AreaForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={async (created) => {
              toast(created ? "Area added" : "Area saved");
              setEditing(null);
              await reload();
            }}
          />
        ) : null}
      </EditorDialog>
      <ConfirmDialog open={deleting !== null} title={`Remove ${deleting?.areaName ?? ""} (${deleting?.pincode ?? ""})?`} tone="danger" confirmLabel="Remove" busy={busy} onConfirm={doDelete} onClose={() => setDeleting(null)}>
        Customers in this PIN code won&apos;t be able to order. Existing orders are not affected. To pause temporarily, edit the area and turn it off instead.
      </ConfirmDialog>
    </Card>
  );
}

function AreaForm({ initial, onCancel, onSaved }: { initial: Area | null; onCancel: () => void; onSaved: (created: boolean) => Promise<void> }) {
  const [f, setF] = useState({
    pincode: initial?.pincode ?? "",
    areaName: initial?.areaName ?? "",
    city: initial?.city ?? "",
    fee: paiseToInput(initial?.fee ?? 0),
    freeAbove: paiseToInput(initial?.freeAbove),
    minOrder: paiseToInput(initial?.minOrder ?? 0),
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
    const fee = inputToPaise(f.fee);
    const freeAbove = inputToPaise(f.freeAbove);
    const minOrder = inputToPaise(f.minOrder);
    if (fee === null || Number.isNaN(fee)) errs.fee = "Enter a fee (0 for free delivery)";
    if (freeAbove !== null && Number.isNaN(freeAbove)) errs.freeAbove = "Use a rupee amount, or leave empty";
    if (minOrder === null || Number.isNaN(minOrder)) errs.minOrder = "Enter an amount (0 for no minimum)";
    const r = adminDeliveryAreaSchema.safeParse({ pincode: f.pincode, areaName: f.areaName, city: f.city, fee: fee ?? 0, freeAbove, minOrder: minOrder ?? 0, active: f.active });
    if (!r.success) Object.assign(errs, { ...issuesToErrors(r.error.issues, { areaName: "Enter the area name", city: "Enter the city" }), ...errs });
    setErrors(errs);
    if (!r.success || Object.keys(errs).length) return;
    setSaving(true);
    try {
      await api(initial ? `/api/admin/delivery/areas/${initial.id}` : "/api/admin/delivery/areas", { method: initial ? "PUT" : "POST", json: r.data });
      await onSaved(!initial);
    } catch (err) {
      const fe = serverFieldErrors(err);
      if (err instanceof ApiError && err.code === "DUPLICATE") fe.pincode = "This PIN code is already listed.";
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
        <Field label="PIN code" htmlFor="a-pin" error={errors.pincode}>
          <Input id="a-pin" inputMode="numeric" maxLength={6} value={f.pincode} invalid={!!errors.pincode} autoFocus onChange={(e) => set({ pincode: e.target.value.replace(/[^\d]/g, "") })} />
        </Field>
        <Field label="City" htmlFor="a-city" error={errors.city}>
          <Input id="a-city" value={f.city} maxLength={60} invalid={!!errors.city} onChange={(e) => set({ city: e.target.value })} />
        </Field>
        <Field label="Area name" htmlFor="a-name" error={errors.areaName} className="sm:col-span-2">
          <Input id="a-name" value={f.areaName} maxLength={80} invalid={!!errors.areaName} onChange={(e) => set({ areaName: e.target.value })} placeholder="e.g. Koramangala" />
        </Field>
        <Field label="Delivery fee" htmlFor="a-fee" error={errors.fee}>
          <MoneyInput id="a-fee" value={f.fee} invalid={!!errors.fee} onChange={(e) => set({ fee: e.target.value })} />
        </Field>
        <Field label="Free delivery above" htmlFor="a-free" error={errors.freeAbove} hint="Optional">
          <MoneyInput id="a-free" value={f.freeAbove} invalid={!!errors.freeAbove} onChange={(e) => set({ freeAbove: e.target.value })} placeholder="—" />
        </Field>
        <Field label="Minimum order" htmlFor="a-min" error={errors.minOrder} hint="0 = only the store-wide minimum (Settings) applies. Customers must reach the higher of the two.">
          <MoneyInput id="a-min" value={f.minOrder} invalid={!!errors.minOrder} onChange={(e) => set({ minOrder: e.target.value })} />
        </Field>
        <div className="flex items-end pb-2.5"><Toggle checked={f.active} onChange={(v) => set({ active: v })} label="Delivering here" /></div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>{initial ? "Save area" : "Add area"}</Button>
      </div>
    </form>
  );
}

/* ---------------- Slots ---------------- */

function cutoffText(m: number) {
  if (m === 0) return "until start";
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h ? `${h} h` : ""}${h && mm ? " " : ""}${mm ? `${mm} min` : ""} before`;
}

function SlotsSection() {
  const toast = useToast();
  const { data, error, reload } = useAdminData<{ slots: Slot[] }>("/api/admin/delivery/slots");
  const [editing, setEditing] = useState<Slot | "new" | null>(null);
  const [deleting, setDeleting] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const slots = data?.slots ?? [];

  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/api/admin/delivery/slots/${deleting.id}`, { method: "DELETE" });
      toast("Slot removed (or turned off if it has orders)");
      await reload();
    } catch (e) {
      setListError(errorMessage(e));
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  return (
    <Card aria-labelledby="slots-h">
      <CardHeader
        id="slots-h"
        title="Delivery slots"
        description="Daily time windows. Orders close at the cut-off; each slot takes a limited number of orders per day."
        actions={<Button size="sm" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Add slot</Button>}
      />
      {listError ? <Notice tone="error" className="m-5">{listError}</Notice> : null}
      {error && !data ? (
        <div className="p-5"><LoadError message={error} onRetry={reload} /></div>
      ) : !data ? (
        <LoadingRows rows={3} className="p-5" />
      ) : slots.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-10 text-center">
          <Clock className="size-7 text-forest-700/60" aria-hidden />
          <p className="mt-2 font-semibold text-forest-900">No delivery slots yet</p>
          <p className="text-sm text-muted">Add at least one slot so customers can choose a delivery time.</p>
        </div>
      ) : (
        <ul className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
          {slots.map((s) => (
            <li key={s.id} className={cn("rounded-2xl border border-line p-4", s.active ? "bg-white" : "bg-sage-50 text-muted")}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-forest-900">{s.label}</p>
                  <p className="text-sm tabular-nums text-ink-soft">{formatSlotTime(s.startTime)} – {formatSlotTime(s.endTime)}</p>
                </div>
                {s.active ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div><dt className="text-muted">Cut-off</dt><dd className="font-medium text-ink">{cutoffText(s.cutoffMinutes)}</dd></div>
                <div><dt className="text-muted">Capacity</dt><dd className="font-medium text-ink">{s.capacity}/day</dd></div>
                <div><dt className="text-muted">Sort</dt><dd className="font-medium text-ink">{s.sortOrder}</dd></div>
              </dl>
              <div className="mt-3 flex justify-end">
                <RowActions name={`${s.label} slot`} onEdit={() => setEditing(s)} onDelete={() => { setListError(null); setDeleting(s); }} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <EditorDialog open={editing !== null} title={editing === "new" ? "New delivery slot" : "Edit delivery slot"} onClose={() => setEditing(null)}>
        {editing !== null ? (
          <SlotForm
            key={editing === "new" ? "new" : editing.id}
            initial={editing === "new" ? null : editing}
            nextSort={slots.reduce((m, s) => Math.max(m, s.sortOrder), 0) + 1}
            onCancel={() => setEditing(null)}
            onSaved={async (created) => {
              toast(created ? "Slot added" : "Slot saved");
              setEditing(null);
              await reload();
            }}
          />
        ) : null}
      </EditorDialog>
      <ConfirmDialog open={deleting !== null} title={`Remove the ${deleting?.label ?? ""} slot?`} tone="danger" confirmLabel="Remove" busy={busy} onConfirm={doDelete} onClose={() => setDeleting(null)}>
        If any orders used this slot it will be turned off instead, so order history stays correct.
      </ConfirmDialog>
    </Card>
  );
}

function SlotForm({ initial, nextSort, onCancel, onSaved }: { initial: Slot | null; nextSort: number; onCancel: () => void; onSaved: (created: boolean) => Promise<void> }) {
  const [f, setF] = useState({
    label: initial?.label ?? "",
    startTime: initial?.startTime ?? "07:00",
    endTime: initial?.endTime ?? "10:00",
    cutoffMinutes: String(initial?.cutoffMinutes ?? 120),
    capacity: String(initial?.capacity ?? 40),
    sortOrder: String(initial?.sortOrder ?? nextSort),
    active: initial?.active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : -1);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const r = adminSlotSchema.safeParse({ ...f, cutoffMinutes: num(f.cutoffMinutes), capacity: num(f.capacity), sortOrder: num(f.sortOrder) });
    if (!r.success) {
      setErrors(issuesToErrors(r.error.issues, { label: "Enter a label like “Morning”", cutoffMinutes: "0–1440 minutes", capacity: "At least 1", sortOrder: "0–99", startTime: "Choose a time" }));
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api(initial ? `/api/admin/delivery/slots/${initial.id}` : "/api/admin/delivery/slots", { method: initial ? "PUT" : "POST", json: r.data });
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
      <Field label="Label" htmlFor="s-label" error={errors.label}>
        <Input id="s-label" value={f.label} maxLength={40} invalid={!!errors.label} autoFocus onChange={(e) => set({ label: e.target.value })} placeholder="Morning" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Starts" htmlFor="s-start" error={errors.startTime}>
          <Input id="s-start" type="time" value={f.startTime} invalid={!!errors.startTime} onChange={(e) => set({ startTime: e.target.value })} />
        </Field>
        <Field label="Ends" htmlFor="s-end" error={errors.endTime}>
          <Input id="s-end" type="time" value={f.endTime} invalid={!!errors.endTime} onChange={(e) => set({ endTime: e.target.value })} />
        </Field>
        <Field label="Cut-off (minutes before start)" htmlFor="s-cut" error={errors.cutoffMinutes} hint={num(f.cutoffMinutes) >= 0 ? `Orders close ${cutoffText(num(f.cutoffMinutes))}` : undefined}>
          <Input id="s-cut" inputMode="numeric" value={f.cutoffMinutes} invalid={!!errors.cutoffMinutes} onChange={(e) => set({ cutoffMinutes: e.target.value.replace(/[^\d]/g, "") })} />
        </Field>
        <Field label="Orders per day" htmlFor="s-cap" error={errors.capacity}>
          <Input id="s-cap" inputMode="numeric" value={f.capacity} invalid={!!errors.capacity} onChange={(e) => set({ capacity: e.target.value.replace(/[^\d]/g, "") })} />
        </Field>
        <Field label="Sort order" htmlFor="s-sort" error={errors.sortOrder}>
          <Input id="s-sort" inputMode="numeric" value={f.sortOrder} invalid={!!errors.sortOrder} onChange={(e) => set({ sortOrder: e.target.value.replace(/[^\d]/g, "") })} />
        </Field>
        <div className="flex items-end pb-2.5"><Toggle checked={f.active} onChange={(v) => set({ active: v })} label="Bookable" /></div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button type="submit" loading={saving}>{initial ? "Save slot" : "Add slot"}</Button>
      </div>
    </form>
  );
}

function RowActions({ name, onEdit, onDelete }: { name: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-1.5">
      <button type="button" onClick={onEdit} aria-label={`Edit ${name}`} title="Edit" className="grid size-9 place-items-center rounded-full border border-line bg-white text-ink-soft hover:bg-sage-100">
        <Pencil className="size-4" aria-hidden />
      </button>
      <button type="button" onClick={onDelete} aria-label={`Remove ${name}`} title="Remove" className="grid size-9 place-items-center rounded-full border border-line bg-white text-danger hover:bg-danger-bg">
        <Trash2 className="size-4" aria-hidden />
      </button>
    </div>
  );
}

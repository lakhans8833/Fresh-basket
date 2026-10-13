"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import type { Address } from "@freshbasket/shared";
import { api } from "@/lib/client/api";
import { AddressFields, emptyAddress, validateAddress, type AddressDraft } from "./address-form";
import { useToast } from "../ui/toast";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/form";
import { EmptyState, Notice } from "../ui/feedback";
import { cn } from "../ui/cn";

type Editing = { id: string | null; draft: AddressDraft } | null;

const toDraft = (a: Address): AddressDraft => ({
  label: a.label, fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2 ?? "", landmark: a.landmark ?? "",
  city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault,
});

const toInput = (d: AddressDraft) => ({ ...d, label: d.label.trim() || "Home", line2: d.line2 || null, landmark: d.landmark || null, isDefault: !!d.isDefault });

export function AddressBook({ initial }: { initial: Address[] }) {
  const toast = useToast();
  const [addresses, setAddresses] = useState(initial);
  const [editing, setEditing] = useState<Editing>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function reload() {
    const r = await api<{ addresses: Address[] }>("/api/me/addresses", { cache: "no-store" });
    setAddresses(r.addresses);
  }

  function open(next: Editing) {
    setEditing(next);
    setErrors({});
    setError(null);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formRef.current?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const errs = validateAddress(editing.draft);
    setErrors(errs);
    if (Object.keys(errs).length) {
      formRef.current?.querySelector<HTMLInputElement>("[aria-invalid=true]")?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input = toInput(editing.draft);
      if (editing.id) await api(`/api/me/addresses/${editing.id}`, { method: "PUT", json: input });
      else await api("/api/me/addresses", { method: "POST", json: input });
      await reload();
      toast(editing.id ? "Address updated" : "Address saved");
      setEditing(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(a: Address) {
    if (!confirm(`Delete the address “${a.label}”? This can't be undone.`)) return;
    setBusy(`del:${a.id}`);
    setError(null);
    try {
      await api(`/api/me/addresses/${a.id}`, { method: "DELETE" });
      await reload();
      if (editing?.id === a.id) setEditing(null);
      toast("Address deleted");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function makeDefault(a: Address) {
    setBusy(`def:${a.id}`);
    setError(null);
    try {
      await api(`/api/me/addresses/${a.id}`, { method: "PUT", json: toInput({ ...toDraft(a), isDefault: true }) });
      await reload();
      toast(`“${a.label}” is now your default address`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="addresses-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="addresses-heading" className="text-2xl font-semibold text-forest-900">Addresses</h1>
        {!editing && addresses.length ? (
          <Button size="sm" variant="dark" onClick={() => open({ id: null, draft: { ...emptyAddress } })}>
            <Plus className="size-4" aria-hidden /> Add address
          </Button>
        ) : null}
      </div>

      {error ? <Notice tone="error" className="mt-5">{error}</Notice> : null}

      {!addresses.length && !editing ? (
        <div className="mt-5">
          <EmptyState
            icon={<MapPin className="size-7" />}
            title="No saved addresses"
            action={<Button variant="dark" onClick={() => open({ id: null, draft: { ...emptyAddress } })}><Plus className="size-4" aria-hidden /> Add an address</Button>}
          >
            Save your delivery address once and pick it at checkout next time.
          </EmptyState>
        </div>
      ) : null}

      {addresses.length ? (
        <ul className="mt-5 grid gap-4 lg:grid-cols-2">
          {addresses.map((a) => (
            <li key={a.id}>
              <article
                aria-labelledby={`addr-${a.id}`}
                className={cn(
                  "flex h-full flex-col rounded-[var(--radius-card)] border bg-white p-5",
                  a.isDefault ? "border-leaf-500/50 ring-1 ring-leaf-500/20" : "border-line",
                  editing?.id === a.id && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id={`addr-${a.id}`} className="font-sans text-base font-semibold text-ink">{a.label}</h2>
                  {a.isDefault ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-lime-100 px-2.5 py-0.5 text-xs font-semibold text-forest-800">
                      <Check className="size-3" aria-hidden /> Default
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-[0.9375rem] font-medium text-ink">{a.fullName} · {a.phone}</p>
                <p className="mt-0.5 text-sm text-muted">
                  {[a.line1, a.line2, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(", ")}
                </p>
                <div className="mt-auto flex flex-wrap gap-2 pt-4">
                  <Button size="sm" variant="outline" disabled={!!busy || saving} onClick={() => open({ id: a.id, draft: toDraft(a) })} aria-label={`Edit address ${a.label}`}>
                    <Pencil className="size-3.5" aria-hidden /> Edit
                  </Button>
                  {!a.isDefault ? (
                    <Button size="sm" variant="ghost" loading={busy === `def:${a.id}`} disabled={!!busy || saving} onClick={() => makeDefault(a)} aria-label={`Set ${a.label} as default address`}>
                      <Star className="size-3.5" aria-hidden /> Set as default
                    </Button>
                  ) : null}
                  <Button size="sm" variant="danger" loading={busy === `del:${a.id}`} disabled={!!busy || saving} onClick={() => remove(a)} aria-label={`Delete address ${a.label}`}>
                    <Trash2 className="size-3.5" aria-hidden /> Delete
                  </Button>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : null}

      {editing ? (
        <form
          ref={formRef}
          onSubmit={submit}
          noValidate
          aria-labelledby="address-form-heading"
          className="mt-6 scroll-mt-28 rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)] sm:p-7"
        >
          <h2 id="address-form-heading" className="text-xl font-semibold text-forest-900">{editing.id ? "Edit address" : "New address"}</h2>
          <p className="mb-5 mt-1 text-sm text-muted">We&apos;ll tell you right away whether we deliver to the PIN code.</p>
          <AddressFields idPrefix="book" value={editing.draft} onChange={(draft) => {
            // Clear an error as soon as its field is edited, so hints (like PIN serviceability) show again.
            setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => draft[k as keyof AddressDraft] === editing.draft[k as keyof AddressDraft])));
            setEditing({ ...editing, draft });
          }} errors={errors} />
          {!(editing.id && addresses.find((x) => x.id === editing.id)?.isDefault) ? (
            <Checkbox
              className="mt-4"
              label="Use as my default delivery address"
              checked={!!editing.draft.isDefault}
              onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, isDefault: e.target.checked } })}
            />
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button type="submit" variant="dark" loading={saving}>{editing.id ? "Save changes" : "Save address"}</Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => { setEditing(null); setErrors({}); }}>Cancel</Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

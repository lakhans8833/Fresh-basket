"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { addressInputSchema, isValidPincode, type AddressInput, type DeliveryArea } from "@freshbasket/shared";
import { api } from "@/lib/client/api";
import { Field, Input } from "../ui/form";
import { Spinner } from "../ui/feedback";

export type AddressDraft = Omit<AddressInput, "isDefault"> & { isDefault?: boolean };

export const emptyAddress: AddressDraft = { label: "Home", fullName: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "", pincode: "" };

/** Validate a draft with the shared schema; returns field → message. */
export function validateAddress(a: AddressDraft): Record<string, string> {
  const r = addressInputSchema.safeParse(a);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) {
    const k = String(i.path[0]);
    out[k] ??= i.message;
  }
  return out;
}

/** Shows whether we deliver to the entered PIN code and fills the city when we know it. */
export function usePincodeCheck(pincode: string) {
  const [state, setState] = useState<{ status: "idle" | "checking" | "ok" | "no"; area?: DeliveryArea | null }>({ status: "idle" });
  useEffect(() => {
    if (!isValidPincode(pincode)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the PIN is incomplete
      setState({ status: "idle" });
      return;
    }
    let live = true;
    setState({ status: "checking" });
    api<{ serviceable: boolean; area: DeliveryArea | null }>(`/api/delivery/check?pincode=${pincode}`)
      .then((r) => live && setState({ status: r.serviceable ? "ok" : "no", area: r.area }))
      .catch(() => live && setState({ status: "idle" }));
    return () => {
      live = false;
    };
  }, [pincode]);
  return state;
}

export function AddressFields({ value, onChange, errors, idPrefix = "addr" }: { value: AddressDraft; onChange: (a: AddressDraft) => void; errors: Record<string, string>; idPrefix?: string }) {
  const pin = usePincodeCheck(value.pincode);
  useEffect(() => {
    if (pin.status === "ok" && pin.area && !value.city) onChange({ ...value, city: pin.area.city });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only autofill once when the PIN resolves
  }, [pin.status]);

  // Errors come from the last submit. Once the customer edits a field, hide that field's old
  // error (e.g. "Enter a valid 6-digit PIN code" while they were still typing) until the next submit.
  const [edited, setEdited] = useState<{ errors: Record<string, string>; keys: Set<string> }>(() => ({ errors, keys: new Set() }));
  const editedKeys = edited.errors === errors ? edited.keys : new Set<string>();
  const change = (k: keyof AddressDraft, next: AddressDraft) => {
    if (errors[k] && !editedKeys.has(k)) setEdited({ errors, keys: new Set(editedKeys).add(k) });
    onChange(next);
  };
  const set = (k: keyof AddressDraft) => (e: React.ChangeEvent<HTMLInputElement>) => change(k, { ...value, [k]: e.target.value });
  const id = (k: string) => `${idPrefix}-${k}`;
  const err = (k: string) => (editedKeys.has(k) ? null : errors[k] ?? null);
  const described = (k: string) => (err(k) ? `${id(k)}-error` : undefined);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Full name" htmlFor={id("fullName")} error={err("fullName")}>
        <Input id={id("fullName")} autoComplete="name" value={value.fullName} onChange={set("fullName")} invalid={!!err("fullName")} aria-describedby={described("fullName")} />
      </Field>
      <Field label="Mobile number" htmlFor={id("phone")} error={err("phone")} hint="For delivery updates">
        <Input id={id("phone")} type="tel" inputMode="tel" autoComplete="tel-national" placeholder="10-digit mobile" value={value.phone} onChange={set("phone")} invalid={!!err("phone")} aria-describedby={described("phone")} />
      </Field>
      <Field label="PIN code" htmlFor={id("pincode")} error={err("pincode")}
        hint={
          pin.status === "checking" ? <span className="inline-flex items-center gap-1.5"><Spinner className="size-3.5" /> Checking delivery…</span>
          : pin.status === "ok" ? <span className="inline-flex items-center gap-1.5 text-leaf-600"><CheckCircle2 className="size-3.5" /> We deliver to {pin.area?.areaName}</span>
          : pin.status === "no" ? <span className="inline-flex items-center gap-1.5 text-amber"><AlertTriangle className="size-3.5" /> We don&apos;t deliver here yet</span>
          : "6 digits"
        }>
        <Input
          id={id("pincode")}
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          value={value.pincode}
          onChange={(e) => change("pincode", { ...value, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
          invalid={!!err("pincode") || pin.status === "no"}
          aria-describedby={described("pincode")}
        />
      </Field>
      <Field label="Save as" htmlFor={id("label")} error={err("label")} hint="e.g. Home, Work">
        <Input id={id("label")} value={value.label} onChange={set("label")} maxLength={30} />
      </Field>
      <Field label="Flat / house no., building, street" htmlFor={id("line1")} error={err("line1")} className="sm:col-span-2">
        <Input id={id("line1")} autoComplete="address-line1" value={value.line1} onChange={set("line1")} invalid={!!err("line1")} aria-describedby={described("line1")} />
      </Field>
      <Field label="Area / locality (optional)" htmlFor={id("line2")} error={err("line2")}>
        <Input id={id("line2")} autoComplete="address-line2" value={value.line2 ?? ""} onChange={set("line2")} />
      </Field>
      <Field label="Landmark (optional)" htmlFor={id("landmark")} error={err("landmark")}>
        <Input id={id("landmark")} value={value.landmark ?? ""} onChange={set("landmark")} />
      </Field>
      <Field label="City" htmlFor={id("city")} error={err("city")}>
        <Input id={id("city")} autoComplete="address-level2" value={value.city} onChange={set("city")} invalid={!!err("city")} aria-describedby={described("city")} />
      </Field>
      <Field label="State" htmlFor={id("state")} error={err("state")}>
        <Input id={id("state")} autoComplete="address-level1" value={value.state} onChange={set("state")} invalid={!!err("state")} aria-describedby={described("state")} />
      </Field>
    </div>
  );
}

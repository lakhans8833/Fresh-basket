"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { MapPin, X } from "lucide-react";
import { isValidPincode, formatINR, type DeliveryArea } from "@freshbasket/shared";
import { api } from "@/lib/client/api";
import { useCart } from "../cart/cart-context";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { Notice } from "../ui/feedback";

export function LocationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { location, setLocation } = useCart();
  const [pin, setPin] = useState(location?.pincode ?? "");
  const [state, setState] = useState<{ status: "idle" | "loading" | "ok" | "no" | "error"; area?: DeliveryArea | null; message?: string }>({ status: "idle" });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function check(e: FormEvent) {
    e.preventDefault();
    if (!isValidPincode(pin)) {
      setState({ status: "error", message: "Enter a valid 6-digit PIN code." });
      return;
    }
    setState({ status: "loading" });
    try {
      const r = await api<{ serviceable: boolean; area: DeliveryArea | null }>(`/api/delivery/check?pincode=${pin}`);
      if (r.serviceable && r.area) {
        setLocation({ pincode: r.area.pincode, areaName: r.area.areaName, city: r.area.city });
        setState({ status: "ok", area: r.area });
      } else {
        setState({ status: "no" });
      }
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-labelledby="loc-title"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-3xl border border-line bg-ivory p-0 text-ink shadow-[var(--shadow-lift)] backdrop:bg-forest-950/40 backdrop:backdrop-blur-sm"
    >
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-lime-100 text-forest-700">
              <MapPin className="size-5" aria-hidden />
            </span>
            <h2 id="loc-title" className="text-xl font-semibold text-forest-900">
              Where should we deliver?
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full hover:bg-sage-100">
            <X className="size-5" />
          </button>
        </div>
        <form onSubmit={check} className="mt-5 flex gap-2">
          <label htmlFor="pin-check" className="sr-only">
            PIN code
          </label>
          <Input
            id="pin-check"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={6}
            placeholder="6-digit PIN code"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            invalid={state.status === "error"}
          />
          <Button type="submit" variant="dark" loading={state.status === "loading"}>
            Check
          </Button>
        </form>
        <div className="mt-4 min-h-6">
          {state.status === "ok" && state.area ? (
            <Notice tone="success" title={`We deliver to ${state.area.areaName}, ${state.area.city}`}>
              Delivery fee {state.area.fee ? formatINR(state.area.fee) : "free"}
              {state.area.freeAbove !== null ? ` · free above ${formatINR(state.area.freeAbove)}` : ""}
              {state.area.minOrder ? ` · minimum order ${formatINR(state.area.minOrder)}` : ""}
            </Notice>
          ) : state.status === "no" ? (
            <Notice tone="warning" title="We don't deliver to this PIN code yet">
              You can still browse — we&apos;re adding new areas over time.
            </Notice>
          ) : state.status === "error" ? (
            <Notice tone="error">{state.message}</Notice>
          ) : location ? (
            <p className="text-sm text-muted">
              Currently delivering to <span className="font-semibold text-ink">{location.areaName}</span> ({location.pincode}).
            </p>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

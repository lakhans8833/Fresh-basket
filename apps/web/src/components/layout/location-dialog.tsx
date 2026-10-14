"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Home, LocateFixed, MapPin, X } from "lucide-react";
import { isValidPincode, formatINR, type Address, type DeliveryArea } from "@freshbasket/shared";
import { useCart } from "../cart/cart-context";
import { useSession } from "../account/session-context";
import { checkPincode, pincodeFromDevice, savedAddresses } from "./delivery-location";
import { Button } from "../ui/button";
import { Input } from "../ui/form";
import { Notice } from "../ui/feedback";

export function LocationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { location, setLocation } = useCart();
  const [pin, setPin] = useState(location?.pincode ?? "");
  const [state, setState] = useState<{ status: "idle" | "loading" | "locating" | "ok" | "no" | "error"; area?: DeliveryArea | null; message?: string }>({ status: "idle" });
  const { profile } = useSession();
  const [addresses, setAddresses] = useState<Address[]>([]);

  // Signed-in customers can pick one of their saved addresses.
  useEffect(() => {
    if (!open || !profile) return;
    let live = true;
    void savedAddresses().then((list) => {
      if (!live) return;
      const seen = new Set<string>();
      const unique = list.filter((a) => {
        const k = `${a.pincode}|${a.line1.trim().toLowerCase()}|${(a.line2 ?? "").trim().toLowerCase()}`;
        return seen.has(k) ? false : (seen.add(k), true);
      });
      setAddresses(unique.slice(0, 4));
    });
    return () => {
      live = false;
    };
  }, [open, profile]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setPin(location?.pincode ?? ""); // show the current PIN each time the dialog opens
      d.showModal();
    }
    if (!open && d.open) d.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the dialog opens/closes, not on every location change
  }, [open]);

  async function apply(pincode: string) {
    if (!isValidPincode(pincode)) {
      setState({ status: "error", message: "Enter a valid 6-digit PIN code." });
      return;
    }
    setPin(pincode);
    setState({ status: "loading" });
    try {
      const r = await checkPincode(pincode);
      if (r.serviceable) {
        setLocation({ pincode: r.area.pincode, areaName: r.area.areaName, city: r.area.city });
        setState({ status: "ok", area: r.area });
      } else {
        setState({ status: "no" });
      }
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  }

  function check(e: FormEvent) {
    e.preventDefault();
    void apply(pin);
  }

  async function locateDevice() {
    setState({ status: "locating" });
    try {
      await apply(await pincodeFromDevice());
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
        <button
          type="button"
          onClick={locateDevice}
          disabled={state.status === "locating" || state.status === "loading"}
          className="mt-3 inline-flex items-center gap-2 rounded-full px-1 py-1 text-sm font-semibold text-forest-800 hover:underline disabled:opacity-60"
        >
          <LocateFixed className="size-4" aria-hidden /> {state.status === "locating" ? "Finding your location…" : "Use my current location"}
        </button>
        {addresses.length ? (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">Your saved addresses</p>
            <ul className="mt-2 space-y-2">
              {addresses.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => void apply(a.pincode)}
                    className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm hover:border-forest-700/40 ${location?.pincode === a.pincode ? "border-leaf-600 bg-lime-50/60" : "border-line bg-white"}`}
                  >
                    <Home className="mt-0.5 size-4 shrink-0 text-forest-800" aria-hidden />
                    <span className="min-w-0">
                      <span className="font-semibold text-ink">{a.label}</span> <span className="text-muted">· {a.pincode}</span>
                      <span className="block truncate text-muted">{[a.line1, a.line2, a.city].filter(Boolean).join(", ")}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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

"use client";

import { useState, type FormEvent } from "react";
import { TicketPercent, X } from "lucide-react";
import { useCart } from "./cart-context";
import { Button } from "../ui/button";

export function CouponForm({ error, applied }: { error?: string; applied: string | null }) {
  const { couponCode, setCouponCode } = useCart();
  const [code, setCode] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (code.trim()) setCouponCode(code.trim().toUpperCase());
  }

  if (couponCode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-2xl border border-dashed border-leaf-500/50 bg-lime-50 px-4 py-3">
          <span className="flex items-center gap-2 text-sm">
            <TicketPercent className="size-4 text-leaf-600" aria-hidden />
            <span className="font-semibold text-forest-900">{couponCode}</span>
            <span className="text-muted">{applied ? "applied" : error ? "" : "checking…"}</span>
          </span>
          <button type="button" onClick={() => setCouponCode(null)} aria-label="Remove coupon" className="grid size-8 place-items-center rounded-full hover:bg-white">
            <X className="size-4" />
          </button>
        </div>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="flex gap-2">
      <label htmlFor="coupon" className="sr-only">Coupon code</label>
      <input
        id="coupon"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Coupon code"
        autoComplete="off"
        maxLength={32}
        className="h-11 min-w-0 flex-1 rounded-full border border-line bg-white px-4 text-sm uppercase placeholder:normal-case focus:border-leaf-500 focus:outline-none focus:ring-4 focus:ring-lime-200/70"
      />
      <Button type="submit" variant="outline" disabled={!code.trim()}>Apply</Button>
    </form>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type { QuoteResponse } from "@freshbasket/shared";
import { api } from "@/lib/client/api";
import { useCart } from "./cart-context";

/** Fetches server-computed totals whenever the basket, coupon or PIN code changes. */
export function useQuote(pincode: string | null | undefined) {
  const { lines, couponCode, hydrated } = useCart();
  const [data, setData] = useState<QuoteResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const key = JSON.stringify([lines.map((l) => [l.variantId, l.quantity]), couponCode, pincode ?? null]);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    if (lines.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset when the basket empties
      setData(null);
      setLoading(false);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await api<QuoteResponse>("/api/quote", {
          method: "POST",
          json: { items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })), couponCode, pincode: pincode || null },
        });
        if (id === seq.current) {
          setData(r);
          setError(null);
        }
      } catch (e) {
        if (id === seq.current) setError((e as Error).message);
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures lines/coupon/pincode
  }, [key, hydrated, nonce]);

  return { data, error, loading, retry: () => setNonce((n) => n + 1) };
}

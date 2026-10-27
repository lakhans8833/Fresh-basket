"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { MAX_LINES, MAX_QTY_PER_LINE } from "@freshbasket/shared";

export interface CartLine {
  variantId: string;
  quantity: number;
  /** Display hints only — prices and totals always come from the server quote. */
  productName: string;
  productSlug: string;
  variantLabel: string;
  imageUrl: string | null;
  priceHint: number;
}

interface DeliveryLocation {
  pincode: string;
  areaName: string;
  city: string;
}

interface CartState {
  lines: CartLine[];
  count: number;
  /** Items value from the prices seen when added (shown in the header / cart bar; checkout uses the server's price). */
  itemsTotal: number;
  hydrated: boolean;
  couponCode: string | null;
  location: DeliveryLocation | null;
  add: (line: Omit<CartLine, "quantity">, qty?: number) => void;
  setQuantity: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  quantityOf: (variantId: string) => number;
  setCouponCode: (c: string | null) => void;
  setLocation: (l: DeliveryLocation | null) => void;
  replaceAll: (lines: CartLine[]) => void;
  /** Today's unit prices from a server quote, so the header / cart bar total matches the cart. */
  syncPrices: (prices: { variantId: string; unitPrice: number }[]) => void;
}

const Ctx = createContext<CartState | null>(null);
const KEY = "fb_cart_v1";
const LOC_KEY = "fb_location_v1";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — cart still works for this visit */
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [couponCode, setCouponCodeState] = useState<string | null>(null);
  const [location, setLocationState] = useState<DeliveryLocation | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = load<{ lines: CartLine[]; couponCode: string | null }>(KEY, { lines: [], couponCode: null });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount
    setLines(Array.isArray(stored.lines) ? stored.lines.filter((l) => l && l.variantId && l.quantity > 0) : []);
    setCouponCodeState(stored.couponCode ?? null);
    setLocationState(load<DeliveryLocation | null>(LOC_KEY, null));
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) {
        const s = load<{ lines: CartLine[]; couponCode: string | null }>(KEY, { lines: [], couponCode: null });
        setLines(s.lines ?? []);
        setCouponCodeState(s.couponCode ?? null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (hydrated) save(KEY, { lines, couponCode });
  }, [lines, couponCode, hydrated]);

  const add = useCallback((line: Omit<CartLine, "quantity">, qty = 1) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.variantId === line.variantId);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i]!, ...line, quantity: Math.min(next[i]!.quantity + qty, MAX_QTY_PER_LINE) };
        return next;
      }
      if (prev.length >= MAX_LINES) return prev;
      return [...prev, { ...line, quantity: Math.min(qty, MAX_QTY_PER_LINE) }];
    });
  }, []);

  const setQuantity = useCallback((variantId: string, qty: number) => {
    setLines((prev) =>
      qty <= 0
        ? prev.filter((l) => l.variantId !== variantId)
        : prev.map((l) => (l.variantId === variantId ? { ...l, quantity: Math.min(qty, MAX_QTY_PER_LINE) } : l)),
    );
  }, []);

  const value = useMemo<CartState>(
    () => ({
      lines,
      count: lines.reduce((s, l) => s + l.quantity, 0),
      itemsTotal: lines.reduce((s, l) => s + l.quantity * (l.priceHint || 0), 0),
      hydrated,
      couponCode,
      location,
      add,
      setQuantity,
      remove: (id) => setLines((prev) => prev.filter((l) => l.variantId !== id)),
      clear: () => {
        setLines([]);
        setCouponCodeState(null);
      },
      quantityOf: (id) => lines.find((l) => l.variantId === id)?.quantity ?? 0,
      setCouponCode: setCouponCodeState,
      syncPrices: (prices) =>
        setLines((prev) => {
          let changed = false;
          const next = prev.map((l) => {
            const p = prices.find((x) => x.variantId === l.variantId)?.unitPrice;
            if (p === undefined || p === l.priceHint) return l;
            changed = true;
            return { ...l, priceHint: p };
          });
          return changed ? next : prev; // same array when nothing changed: no re-render loop
        }),
      setLocation: (l) => {
        setLocationState(l);
        save(LOC_KEY, l);
      },
      replaceAll: setLines,
    }),
    [lines, hydrated, couponCode, location, add, setQuantity],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}

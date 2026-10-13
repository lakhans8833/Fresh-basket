import { MAX_LINES, MAX_QTY_PER_LINE } from "@shared/pricing";
import type { QuoteResponse } from "@shared/types";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, errorMessage } from "./api";
import { readJSON, writeJSON } from "./storage";

export interface CartLine {
  variantId: string;
  quantity: number;
  productName: string;
  productSlug: string;
  variantLabel: string;
  imageUrl: string | null;
  /** Display-only price (paise) captured when added. Totals always come from POST /api/quote. */
  priceHint: number;
}

export interface DeliveryLocation {
  pincode: string;
  areaName: string;
  city: string;
}

interface PersistedCart {
  lines: CartLine[];
  couponCode: string | null;
  location: DeliveryLocation | null;
}

interface CartState extends PersistedCart {
  hydrated: boolean;
  count: number;
  add(line: Omit<CartLine, "quantity">, quantity?: number): void;
  setQuantity(variantId: string, quantity: number): void;
  remove(variantId: string): void;
  clear(): void;
  setCoupon(code: string | null): void;
  setLocation(loc: DeliveryLocation | null): void;
  quantityOf(variantId: string): number;
  /** server quote for the current cart (null until loaded / when empty) */
  quote: QuoteResponse | null;
  quoteLoading: boolean;
  quoteError: string | null;
  refreshQuote(): void;
  /** changes whenever the order contents change (used to regenerate idempotency keys) */
  signature: string;
}

const KEY = "fb.cart.v1";
const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedCart>({ lines: [], couponCode: null, location: null });
  const [hydrated, setHydrated] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteNonce, setQuoteNonce] = useState(0);
  const reqId = useRef(0);

  useEffect(() => {
    readJSON<PersistedCart>(KEY).then((saved) => {
      if (saved && Array.isArray(saved.lines)) {
        setState({
          lines: saved.lines.filter((l) => l && typeof l.variantId === "string" && l.quantity > 0),
          couponCode: saved.couponCode ?? null,
          location: saved.location ?? null,
        });
      }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (hydrated) void writeJSON(KEY, state);
  }, [state, hydrated]);

  const signature = useMemo(
    () =>
      JSON.stringify([
        state.lines.map((l) => [l.variantId, l.quantity]),
        state.couponCode,
        state.location?.pincode ?? null,
      ]),
    [state],
  );

  // Server-side quote, debounced; the only source of totals.
  useEffect(() => {
    if (!hydrated) return;
    if (state.lines.length === 0) {
      setQuote(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }
    const id = ++reqId.current;
    setQuoteLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api<QuoteResponse>("/api/quote", {
          method: "POST",
          body: {
            items: state.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
            couponCode: state.couponCode,
            pincode: state.location?.pincode ?? null,
          },
          auth: true,
        });
        if (id !== reqId.current) return;
        setQuote(res);
        setQuoteError(null);
      } catch (e) {
        if (id !== reqId.current) return;
        setQuoteError(errorMessage(e));
      } finally {
        if (id === reqId.current) setQuoteLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, hydrated, quoteNonce]);

  const add = useCallback((line: Omit<CartLine, "quantity">, quantity = 1) => {
    setState((s) => {
      const existing = s.lines.find((l) => l.variantId === line.variantId);
      if (existing) {
        return {
          ...s,
          lines: s.lines.map((l) =>
            l.variantId === line.variantId
              ? { ...l, ...line, quantity: Math.min(MAX_QTY_PER_LINE, l.quantity + quantity) }
              : l,
          ),
        };
      }
      if (s.lines.length >= MAX_LINES) return s;
      return { ...s, lines: [...s.lines, { ...line, quantity: Math.min(MAX_QTY_PER_LINE, Math.max(1, quantity)) }] };
    });
  }, []);

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    setState((s) => ({
      ...s,
      lines:
        quantity <= 0
          ? s.lines.filter((l) => l.variantId !== variantId)
          : s.lines.map((l) => (l.variantId === variantId ? { ...l, quantity: Math.min(MAX_QTY_PER_LINE, quantity) } : l)),
    }));
  }, []);

  const remove = useCallback((variantId: string) => {
    setState((s) => ({ ...s, lines: s.lines.filter((l) => l.variantId !== variantId) }));
  }, []);

  const clear = useCallback(() => setState((s) => ({ ...s, lines: [], couponCode: null })), []);
  const setCoupon = useCallback(
    (code: string | null) => setState((s) => ({ ...s, couponCode: code ? code.trim().toUpperCase() : null })),
    [],
  );
  const setLocation = useCallback((location: DeliveryLocation | null) => setState((s) => ({ ...s, location })), []);

  const value = useMemo<CartState>(
    () => ({
      ...state,
      hydrated,
      count: state.lines.reduce((n, l) => n + l.quantity, 0),
      add,
      setQuantity,
      remove,
      clear,
      setCoupon,
      setLocation,
      quantityOf: (id) => state.lines.find((l) => l.variantId === id)?.quantity ?? 0,
      quote,
      quoteLoading,
      quoteError,
      refreshQuote: () => setQuoteNonce((n) => n + 1),
      signature,
    }),
    [state, hydrated, add, setQuantity, remove, clear, setCoupon, setLocation, quote, quoteLoading, quoteError, signature],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}

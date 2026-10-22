import type { PaymentMethod } from "@shared/orderStatus";
import type { StoreSettings } from "@shared/types";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

interface SettingsState {
  settings: StoreSettings | null;
  paymentMethods: PaymentMethod[];
  error: string | null;
  reload(): Promise<void>;
}

const SettingsContext = createContext<SettingsState | null>(null);

/** Payment methods the app checkout can complete end to end. */
export const APP_PAYMENT_METHODS: PaymentMethod[] = ["cod", "razorpay", "mock"];

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await api<{ settings: StoreSettings; paymentMethods: PaymentMethod[] }>("/api/settings", { auth: false });
      setSettings(res.settings);
      // The app can only complete cash on delivery and Razorpay checkout. UPI (pay to the store's UPI ID,
      // then send the reference) has no screen in the app, so a UPI order would sit unpaid until it expired.
      setPaymentMethods(res.paymentMethods.filter((m) => APP_PAYMENT_METHODS.includes(m)));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load store settings.");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <SettingsContext.Provider value={{ settings, paymentMethods, error, reload }}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}

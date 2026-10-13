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

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await api<{ settings: StoreSettings; paymentMethods: PaymentMethod[] }>("/api/settings", { auth: false });
      setSettings(res.settings);
      setPaymentMethods(res.paymentMethods);
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

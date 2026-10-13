import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { readJSON, writeJSON } from "./storage";

/** Locally saved "hearted" products (device only; there is no server wishlist). */
interface FavState {
  isFavourite(productId: string): boolean;
  toggle(productId: string): void;
}
const FavContext = createContext<FavState | null>(null);
const KEY = "fb.favourites.v1";

export function FavouritesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    readJSON<string[]>(KEY).then((v) => {
      if (Array.isArray(v)) setIds(v);
      setHydrated(true);
    });
  }, []);
  useEffect(() => {
    if (hydrated) void writeJSON(KEY, ids);
  }, [ids, hydrated]);
  const toggle = useCallback((id: string) => setIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])), []);
  const value = useMemo(() => ({ isFavourite: (id: string) => ids.includes(id), toggle }), [ids, toggle]);
  return <FavContext.Provider value={value}>{children}</FavContext.Provider>;
}

export function useFavourites(): FavState {
  const ctx = useContext(FavContext);
  if (!ctx) throw new Error("useFavourites must be used inside FavouritesProvider");
  return ctx;
}

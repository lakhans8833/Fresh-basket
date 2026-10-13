import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage } from "./api";

export interface FetchState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  reload(): Promise<void>;
  refresh(): Promise<void>;
  setData(updater: (d: T | null) => T | null): void;
}

/** GET a JSON endpoint. Pass null as path to skip. Re-runs when the path changes. */
export function useFetch<T>(path: string | null, deps: unknown[] = []): FetchState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);

  const run = useCallback(
    async (mode: "load" | "refresh") => {
      if (path === null) {
        setLoading(false);
        return;
      }
      const id = ++seq.current;
      if (mode === "load") setLoading(true);
      else setRefreshing(true);
      try {
        const res = await api<T>(path);
        if (id !== seq.current) return;
        setDataState(res);
        setError(null);
      } catch (e) {
        if (id !== seq.current) return;
        setError(errorMessage(e));
      } finally {
        if (id === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, ...deps],
  );

  useEffect(() => {
    void run("load");
  }, [run]);

  return {
    data,
    error,
    loading,
    refreshing,
    reload: () => run("load"),
    refresh: () => run("refresh"),
    setData: (u) => setDataState((d) => u(d)),
  };
}

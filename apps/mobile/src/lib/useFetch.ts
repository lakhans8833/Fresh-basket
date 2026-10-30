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

/**
 * GET a JSON endpoint. Pass null as path to skip. Re-runs when the path or deps change — and then
 * forgets the old result first, so e.g. another account's orders never show while the new ones load.
 */
export function useFetch<T>(path: string | null, deps: unknown[] = []): FetchState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(path !== null);
  const [refreshing, setRefreshing] = useState(false);
  const seq = useRef(0);
  const shownKey = useRef<string | null>(null);
  const key = JSON.stringify([path, ...deps]);

  const run = useCallback(
    async (mode: "load" | "refresh") => {
      if (path === null) {
        ++seq.current;
        shownKey.current = null;
        setDataState(null);
        setError(null);
        setLoading(false);
        return;
      }
      const id = ++seq.current;
      if (shownKey.current !== key) {
        // Different request than what's on screen (other account, other product): don't show stale data.
        setDataState(null);
        setError(null);
      }
      if (mode === "load") setLoading(true);
      else setRefreshing(true);
      try {
        const res = await api<T>(path);
        if (id !== seq.current) return;
        shownKey.current = key;
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
    [path, key],
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

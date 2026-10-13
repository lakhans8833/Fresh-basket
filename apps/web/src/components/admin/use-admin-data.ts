"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client/api";

/**
 * Loads JSON from an admin endpoint and keeps loading / error / data state.
 * Changing `path` or calling `reload()` refetches without blanking the current data
 * (no flash of skeletons); `loading` is true while a request is in flight.
 */
export function useAdminData<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settledPath, setSettledPath] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(0);
  const seq = useRef(0);

  const fetchPath = useCallback((p: string) => {
    const id = ++seq.current;
    return api<T>(p, { cache: "no-store" }).then(
      (r) => {
        if (id !== seq.current) return;
        setData(r);
        setError(null);
        setSettledPath(p);
      },
      (e) => {
        if (id !== seq.current) return;
        setError(e instanceof ApiError ? e.message : "Couldn't load this page.");
        setSettledPath(p);
      },
    );
  }, []);

  useEffect(() => {
    if (path) void fetchPath(path);
  }, [path, fetchPath]);

  const reload = useCallback(async () => {
    if (!path) return;
    setRefreshing((n) => n + 1);
    try {
      await fetchPath(path);
    } finally {
      setRefreshing((n) => n - 1);
    }
  }, [path, fetchPath]);

  const loading = path !== null && (settledPath !== path || refreshing > 0);
  return { data, setData, error, loading, reload };
}

/** Flattened zod errors from the server ({ fieldErrors }) → first message per field. */
export function serverFieldErrors(e: unknown): Record<string, string> {
  if (!(e instanceof ApiError)) return {};
  const d = e.details as { fieldErrors?: Record<string, string[] | undefined> } | undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d?.fieldErrors ?? {})) if (v?.[0]) out[k] = v[0];
  return out;
}

export function errorMessage(e: unknown, fallback = "Something went wrong. Please try again.") {
  return e instanceof Error && e.message ? e.message : fallback;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateImage(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return `${file.name}: upload a JPEG, PNG or WebP image.`;
  if (file.size > MAX_IMAGE_BYTES) return `${file.name}: images must be 5 MB or smaller.`;
  return null;
}

/** Validates client-side, then uploads to /api/admin/upload. Returns the public URL. */
export async function uploadImage(file: File): Promise<string> {
  const problem = validateImage(file);
  if (problem) throw new Error(problem);
  const fd = new FormData();
  fd.append("file", file);
  const r = await api<{ url: string }>("/api/admin/upload", { method: "POST", body: fd });
  return r.url;
}

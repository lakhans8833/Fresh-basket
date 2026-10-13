import { API_URL } from "./config";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
  get isNetwork() {
    return this.code === "NETWORK" || this.code === "TIMEOUT";
  }
}

type TokenGetter = () => Promise<string | null>;
let tokenGetter: TokenGetter = async () => null;
let onUnauthorized: (() => void) | null = null;

/** Registered by the AuthProvider so every request carries the current bearer token. */
export function setAuthHandlers(getter: TokenGetter, unauthorized: (() => void) | null) {
  tokenGetter = getter;
  onUnauthorized = unauthorized;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** default true: attach Authorization header when signed in */
  auth?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, timeoutMs = 20000 } = opts;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = await tokenGetter();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onOuterAbort);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    if (controller.signal.aborted) {
      throw new ApiError("The server is taking too long to respond. Please try again.", 0, "TIMEOUT");
    }
    throw new ApiError("You appear to be offline. Check your connection and try again.", 0, "NETWORK");
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; code?: string; details?: unknown };
    if (res.status === 401 && auth && onUnauthorized) onUnauthorized();
    throw new ApiError(
      err.error || (res.status >= 500 ? "Something went wrong on our side. Please try again." : `Request failed (${res.status})`),
      res.status,
      err.code,
      err.details,
    );
  }
  return data as T;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong. Please try again.";
}

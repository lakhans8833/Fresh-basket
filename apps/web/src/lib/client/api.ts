"use client";

/** Fired on window when any API call returns 401. */
export const UNAUTHORIZED_EVENT = "fb:unauthorized";
/** Fired after a 401 when the session turned out to be fine (e.g. it was just refreshed). */
export const SESSION_RECOVERED_EVENT = "fb:session-recovered";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string, public details?: unknown) {
    super(message);
  }
}

/**
 * The server definitely didn't keep this order attempt (ORDER_CANCELLED, or a 4xx rejection such as
 * "slot full"): the customer's next deliberate attempt must use a NEW idempotency key. Offline (status 0),
 * timeouts, 429 and ambiguous 5xx keep the key, so a retry returns the order if it was in fact saved.
 */
export function isDefiniteRejection(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.code === "ORDER_CANCELLED") return true;
  return err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429;
}

/** Fetch JSON from our API. Throws ApiError with the server's message on failure. */
export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "You appear to be offline. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  // A 401 on a call we expected to be signed in for: let the SessionProvider re-check the session
  // (and send the user to sign in if it's really gone). /api/me itself reports "signed out" with 200.
  if (res.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Something went wrong.", data.code, data.details);
  return data as T;
}

export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

"use client";

/** Saved-for-later product ids. Stored on this device only (see the privacy page). */
const KEY = "fb_favourites_v1";
const EVENT = "fb-favourites-change";

export function readFavourites(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeFavourites(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* private mode: only this page view remembers it */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Calls `fn` when favourites change in this tab or another tab. */
export function onFavouritesChange(fn: () => void): () => void {
  const onStorage = (e: StorageEvent) => e.key === KEY && fn();
  window.addEventListener(EVENT, fn);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("storage", onStorage);
  };
}

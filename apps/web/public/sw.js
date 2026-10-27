/*
 * Rams Fresh Basket — service worker.
 * What it does (and doesn't):
 *  - Caches the app's static files (/_next/static, images, icons) so repeat visits load faster.
 *  - When the phone is offline, page navigations show /offline.html instead of the browser error.
 *  - It never caches pages, prices, the cart API, checkout, account or admin — those always need
 *    the network, so customers never see stale prices or someone else's data.
 * Bump VERSION when this file changes.
 */
const VERSION = "v2";
const STATIC_CACHE = `rafb-static-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("rafb-") && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/favicon.ico"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // Network only for pages; offline page as a fallback.
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (isStaticAsset(url) && !url.pathname.startsWith("/_next/static/")) {
    // Site images / icons can be replaced under the same name: show the saved copy at once, and
    // refresh it in the background so the next visit gets the new one (stale-while-revalidate).
    event.respondWith(
      caches.open(STATIC_CACHE).then((c) =>
        c.match(req).then((hit) => {
          const fresh = fetch(req)
            .then((res) => {
              if (res.ok && res.type === "basic") c.put(req, res.clone());
              return res;
            })
            .catch(() => hit);
          if (hit) event.waitUntil(fresh.then(() => undefined));
          return hit || fresh;
        }),
      ),
    );
    return;
  }

  if (isStaticAsset(url)) {
    // Cache first: /_next/static files have a content hash in their name, so they never change.
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && res.type === "basic") {
              const copy = res.clone();
              caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
  // Everything else (API, RSC data, pages) goes straight to the network.
});

#!/usr/bin/env node
/**
 * Storefront banner/hero photos (CC0 / public domain — sources and licences in public/images/site/LICENSES.md).
 *
 * For each photo below, if public/images/site/<file> is missing this script downloads it from its source.
 * If the download fails (offline, source moved), it copies the old development image instead, so the
 * site never shows a broken picture. Runs before `next build`; commit the downloaded files once
 * (`npm run images -w apps/web`, then `git add apps/web/public/images/site`) so builds don't depend on the source site.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.resolve(here, "../public");
const dir = path.join(pub, "images/site");

export const SITE_IMAGES = [
  {
    file: "hero-veg-basket.webp",
    source: "https://images.rawpixel.com/editor_1024/cHJpdmF0ZS9zdGF0aWMvaW1hZ2Uvd2Vic2l0ZS8yMDIyLTA0L2xyL2lzMTYwNDgtaW1hZ2Uta3d2d3NrODUuanBn.jpg",
    fallback: "images/dev/hero-basket-wide.jpg",
  },
  {
    file: "hero-shopping-basket.webp",
    source: "https://images.rawpixel.com/editor_1024/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvcHUyMzMzNDIyLWltYWdlLWt3dndsdTFyLmpwZw.jpg",
    fallback: "images/dev/hero-basket.jpg",
  },
  {
    file: "banner-market.webp",
    source: "https://images.rawpixel.com/editor_1024/cHJpdmF0ZS9sci9pbWFnZXMvd2Vic2l0ZS8yMDIyLTA1L3B4NzU5NzA0LWltYWdlLWt3dnhmeGEwLmpwZw.jpg",
    fallback: "images/dev/banner-basket.jpg",
  },
  {
    file: "banner-roots.webp",
    source: "https://images.rawpixel.com/editor_1024/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvZmw4NTM4Mzc4ODgwLWltYWdlLWt5Y2locTl3LmpwZw.jpg",
    fallback: "images/dev/banner-veg.jpg",
  },
  {
    file: "tile-all.webp",
    source: "https://images.rawpixel.com/editor_1024/czNmcy1wcml2YXRlL3Jhd3BpeGVsX2ltYWdlcy93ZWJzaXRlX2NvbnRlbnQvbHIvcHUyMzMzNDE0LWltYWdlLWt3eXJyYXZ4LmpwZw.jpg",
    fallback: "images/dev/all-basket.jpg",
  },
  {
    file: "tile-seasonal.webp",
    source: "https://images.rawpixel.com/editor_1024/cHJpdmF0ZS9zdGF0aWMvaW1hZ2Uvd2Vic2l0ZS8yMDIyLTA0L2xyL3B1MjMzMzQxMC1pbWFnZS1rd3Z3bHp5MS5qcGc.jpg",
    fallback: "images/dev/seasonal-mix.jpg",
  },
];

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "user-agent": "ram-avatar-fresh-basket-build", accept: "image/webp,image/*;q=0.8" } });
  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.startsWith("image/")) throw new Error(`${res.status} ${type}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10_000) throw new Error(`too small (${buf.length} bytes)`);
  return buf;
}

/** A file identical to its dev fallback is only a stand-in from an earlier failed download — try again. */
function isStandIn(file, fallback) {
  return readFileSync(file).equals(readFileSync(path.join(pub, fallback)));
}

mkdirSync(dir, { recursive: true });
for (const img of SITE_IMAGES) {
  const target = path.join(dir, img.file);
  if (existsSync(target) && !isStandIn(target, img.fallback)) continue;
  try {
    writeFileSync(target, await download(img.source));
    console.log(`[images] downloaded ${img.file}`);
  } catch (e) {
    if (!existsSync(target)) copyFileSync(path.join(pub, img.fallback), target);
    console.warn(`[images] ${img.file}: download failed (${e.message}) — using ${img.fallback} for now`);
  }
}

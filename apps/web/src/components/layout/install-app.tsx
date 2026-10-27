"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";
import Image from "next/image";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/*
 * One shared install state for the whole page. Chrome/Edge/Android fire `beforeinstallprompt` once and the
 * saved event can only be used once, so the footer button and the phone banner must share it.
 * iOS Safari has no install prompt — iPhone users get the Share → Add to Home Screen hint instead.
 */
type InstallState = { canPrompt: boolean; ios: boolean; installed: boolean; ready: boolean };
let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { canPrompt: false, ios: false, installed: false, ready: false };
const listeners = new Set<() => void>();
const SERVER_STATE: InstallState = { canPrompt: false, ios: false, installed: false, ready: false };

function set(next: Partial<InstallState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function init() {
  if (state.ready || typeof window === "undefined") return;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
  set({ ready: true, installed: standalone, ios, canPrompt: deferred !== null || state.canPrompt });
}

// Listen as soon as this module loads (before React hydrates): Chrome can fire the install prompt
// early on repeat visits, and an event fired before a listener exists is lost.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    set({ installed: true, canPrompt: false });
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  init();
  return () => listeners.delete(l);
}

export function usePwaInstall() {
  const s = useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
  async function promptInstall() {
    if (!deferred) return false;
    const e = deferred;
    deferred = null;
    set({ canPrompt: false });
    await e.prompt();
    const choice = await e.userChoice.catch(() => null);
    return choice?.outcome === "accepted";
  }
  return { ...s, available: !s.installed && (s.canPrompt || s.ios), promptInstall };
}

const shortName = (storeName: string) => storeName.split(" ").slice(-2).join(" ");

function IosHint({ onClose, tone = "dark" }: { onClose: () => void; tone?: "dark" | "light" }) {
  return (
    <p role="status" className={tone === "dark" ? "mt-3 flex max-w-xs items-start gap-2 rounded-xl bg-white/10 p-3 text-sm text-white/90" : "mt-2 flex items-start gap-2 rounded-xl bg-lime-50 p-3 text-sm text-ink-soft"}>
      <Share className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>On iPhone: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>.</span>
      <button type="button" aria-label="Close" onClick={onClose} className="ml-auto"><X className="size-4" /></button>
    </p>
  );
}

/** "Install app" button in the footer. */
export function InstallAppButton({ storeName }: { storeName: string }) {
  const pwa = usePwaInstall();
  const [showHint, setShowHint] = useState(false);
  if (!pwa.available) return null;

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={async () => {
          if (pwa.canPrompt) await pwa.promptInstall();
          else setShowHint((v) => !v);
        }}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-lime-300 px-5 text-sm font-semibold text-forest-900 hover:bg-lime-200"
      >
        <Download className="size-4" aria-hidden /> Install the {shortName(storeName)} app
      </button>
      {showHint ? <IosHint onClose={() => setShowHint(false)} /> : null}
    </div>
  );
}

const DISMISS_KEY = "fb_install_banner_dismissed_at";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < SNOOZE_MS;
  } catch {
    return false;
  }
}

/**
 * Small "Add to home screen" card on phones, under the header. Appears a few seconds after the page loads,
 * only when the browser can install the app (or on iPhone Safari), and stays hidden for 14 days once closed.
 */
export function InstallBanner({ storeName }: { storeName: string }) {
  const pwa = usePwaInstall();
  const [visible, setVisible] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (!pwa.available || dismissedRecently()) return;
    const t = setTimeout(() => setVisible(true), 4000);
    return () => clearTimeout(t);
  }, [pwa.available]);

  if (!visible || !pwa.available) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* private mode: just hide for this visit */
    }
    setVisible(false);
  }

  return (
    <aside aria-label="Install app" className="container-page pt-3 md:hidden print:hidden">
      <div className="rounded-[var(--radius-card)] border border-line bg-white p-3 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3">
          <Image src="/icons/icon-192.png" alt="" width={44} height={44} className="size-11 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Get the {shortName(storeName)} app</p>
            <p className="text-xs text-muted">Order faster from your home screen — no app store needed.</p>
          </div>
          <button
            type="button"
            onClick={async () => {
              if (pwa.canPrompt) {
                if (await pwa.promptInstall()) setVisible(false);
              } else setShowHint((v) => !v);
            }}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-forest-800 px-3.5 text-sm font-semibold text-white hover:bg-forest-900"
          >
            <Download className="size-4" aria-hidden /> Install
          </button>
          <button type="button" onClick={dismiss} aria-label="Not now" className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-sage-100">
            <X className="size-4" />
          </button>
        </div>
        {showHint ? <IosHint tone="light" onClose={() => setShowHint(false)} /> : null}
      </div>
    </aside>
  );
}

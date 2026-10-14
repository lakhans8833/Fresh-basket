"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * "Install app" for the PWA. Chrome/Edge/Android fire `beforeinstallprompt`; iOS Safari
 * doesn't, so iPhone users get the Share → Add to Home Screen hint instead.
 */
export function InstallAppButton({ storeName }: { storeName: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read device capabilities after mount
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed || (!deferred && !ios)) return null;

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={async () => {
          if (deferred) {
            await deferred.prompt();
            await deferred.userChoice.catch(() => null);
            setDeferred(null);
          } else setShowHint((v) => !v);
        }}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-lime-300 px-5 text-sm font-semibold text-forest-900 hover:bg-lime-200"
      >
        <Download className="size-4" aria-hidden /> Install the {storeName.split(" ").slice(-2).join(" ")} app
      </button>
      {showHint ? (
        <p role="status" className="mt-3 flex max-w-xs items-start gap-2 rounded-xl bg-white/10 p-3 text-sm text-white/90">
          <Share className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>On iPhone: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>.</span>
          <button type="button" aria-label="Close" onClick={() => setShowHint(false)} className="ml-auto"><X className="size-4" /></button>
        </p>
      ) : null}
    </div>
  );
}

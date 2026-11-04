/**
 * FB-05 (optional): a Cloudflare Turnstile token for POST /api/auth/email. Off (undefined, nothing loaded)
 * unless the site was built with TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY (next.config.ts exposes the
 * site key). The check is invisible for most visitors; when Cloudflare wants an interaction, a small
 * box appears at the bottom of the screen until it's done.
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

interface Turnstile {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  remove(id: string): void;
}
let loading: Promise<Turnstile> | null = null;

function load(): Promise<Turnstile> {
  const w = window as unknown as { turnstile?: Turnstile };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  return (loading ??= new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error("turnstile missing")));
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error("turnstile blocked"));
    };
    document.head.appendChild(s);
  }));
}

export async function turnstileToken(): Promise<string | undefined> {
  if (!SITE_KEY) return undefined;
  // Couldn't load (offline, blocked by an extension): send without a token and let the server explain.
  const ts = await load().catch(() => null);
  if (!ts) return undefined;
  return new Promise<string>((resolve, reject) => {
    const box = document.createElement("div");
    box.setAttribute("aria-label", "Security check");
    box.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:1000";
    document.body.appendChild(box);
    let id = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (id) ts.remove(id);
      } catch {
        /* already gone */
      }
      box.remove();
      fn();
    };
    const fail = () => finish(() => reject(new Error("The security check didn't finish. Please try again.")));
    const timer = setTimeout(fail, 120_000);
    id = ts.render(box, {
      sitekey: SITE_KEY,
      appearance: "interaction-only",
      callback: (token: string) => finish(() => resolve(token)),
      "error-callback": fail,
      "expired-callback": fail,
      "timeout-callback": fail,
    });
  });
}

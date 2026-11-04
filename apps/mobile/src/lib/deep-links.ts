/**
 * FB-37 helpers (no React Native imports, tested in Node).
 * (a) createCodeExchanger: an OAuth ?code= is exchanged exactly once, whether it comes back through the
 *     browser session (signInWithGoogle) or the system also opens freshbasket://auth-callback?code=….
 * (b) createOrderLinkFilter: the payment page returns to freshbasket://orders/<id>; Android can deliver
 *     that link twice (auth session + intent). A second copy within a few seconds, or a link to the order
 *     already on screen, is dropped — the screen is told to refresh instead of being pushed again.
 */
export type ExchangeResult = "exchanged" | "already_handled";

export function createCodeExchanger(exchange: (code: string) => Promise<void>) {
  const seen = new Map<string, Promise<void>>();
  return async function run(code: string): Promise<ExchangeResult> {
    const running = seen.get(code);
    if (running) {
      await running.catch(() => undefined);
      return "already_handled";
    }
    const p = exchange(code);
    seen.set(code, p);
    try {
      await p;
      return "exchanged";
    } catch (e) {
      seen.delete(code); // never usable again anyway, but don't keep failures around
      throw e;
    } finally {
      if (seen.size > 20) seen.delete(seen.keys().next().value!);
    }
  };
}

/** Order id from "/orders/<id>", "orders/<id>?x" or "freshbasket://orders/<id>". */
export function orderIdFromLink(path: string): string | null {
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?\/?(?:--\/)?orders\/([^/?#]+)/i.exec(path);
  return m ? decodeURIComponent(m[1]!) : null;
}

export function createOrderLinkFilter({ now = Date.now, windowMs = 10_000, onDuplicate }: { now?: () => number; windowMs?: number; onDuplicate?: (orderId: string) => void } = {}) {
  let visible: string | null = null;
  let last: { id: string; at: number } | null = null;
  const filter = (path: string): string | null => {
    const id = orderIdFromLink(path);
    if (!id) return path;
    const t = now();
    if (visible === id || (last && last.id === id && t - last.at < windowMs)) {
      onDuplicate?.(id);
      return null;
    }
    last = { id, at: t };
    return path;
  };
  return Object.assign(filter, {
    setVisibleOrder(id: string | null) {
      visible = id;
    },
  });
}

import { createOrderLinkFilter } from "./deep-links";

/** FB-37(b): one filter for the whole app (used by app/+native-intent.tsx and the order screen). */
const refreshers = new Map<string, Set<() => void>>();

export const orderLinks = createOrderLinkFilter({
  onDuplicate: (id) => refreshers.get(id)?.forEach((fn) => fn()),
});

/** The order screen for `id` is on screen: a repeated link to it refreshes it instead of opening a copy. */
export function watchOrderLinks(id: string, refresh: () => void): () => void {
  orderLinks.setVisibleOrder(id);
  const set = refreshers.get(id) ?? new Set();
  set.add(refresh);
  refreshers.set(id, set);
  return () => {
    orderLinks.setVisibleOrder(null);
    set.delete(refresh);
    if (!set.size) refreshers.delete(id);
  };
}

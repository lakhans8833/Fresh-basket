import { orderLinks } from "@/lib/order-links";

/**
 * Every deep link the system hands the app passes here first (expo-router). FB-37(b): the payment page's
 * return link freshbasket://orders/<id> can arrive twice; a repeat (or a link to the order already on
 * screen) is dropped and that screen refreshes. A link that starts the app is always opened.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  const kept = orderLinks(path);
  if (initial) return path;
  // An empty path makes expo-router ignore the link (it only navigates when a path is returned).
  return kept ?? "";
}

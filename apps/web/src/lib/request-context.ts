import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/** Per-request facts other modules need without passing them through every call (who is acting). */
export type RequestContext = { actor?: { id: string; email: string | null; role: string } };

export const requestContext = new AsyncLocalStorage<RequestContext>();

/** Remember the signed-in staff member for this request (set by requireStaff / requireAdmin). */
export function setActor(actor: { id: string; email: string | null; role: string }) {
  const store = requestContext.getStore();
  if (store) store.actor = actor;
}

export function currentActor() {
  return requestContext.getStore()?.actor;
}

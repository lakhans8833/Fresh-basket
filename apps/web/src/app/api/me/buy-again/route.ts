import { json, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { listBuyAgain } from "@/lib/catalog";

/**
 * Products from my past orders (newest first) with the pack bought last time, for the phone app's
 * "Buy again" row. Same data as the website's Buy Again row. Signed-in customers only.
 */
export const GET = route(async () => {
  const s = await requireUser();
  return json(await listBuyAgain(s.userId, 12));
});

import { releaseExpiredSoon } from "@/lib/orders";
import { json, route } from "@/lib/http";
import { getSlotOptions } from "@/lib/delivery";
import { getSettings } from "@/lib/settings";

export const GET = route(async () => {
  await releaseExpiredSoon(); // abandoned unpaid orders give their stock / slot places back
  const s = await getSettings();
  return json({ slots: await getSlotOptions(s.slotDaysAhead) });
});

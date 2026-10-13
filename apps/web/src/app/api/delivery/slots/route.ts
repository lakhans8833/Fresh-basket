import { json, route } from "@/lib/http";
import { getSlotOptions } from "@/lib/delivery";
import { getSettings } from "@/lib/settings";

export const GET = route(async () => {
  const s = await getSettings();
  return json({ slots: await getSlotOptions(s.slotDaysAhead) });
});

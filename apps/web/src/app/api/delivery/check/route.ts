import { isValidPincode, normalizePincode } from "@freshbasket/shared";
import { badRequest, json, route } from "@/lib/http";
import { getArea, getSlotOptions } from "@/lib/delivery";
import { getSettings } from "@/lib/settings";

/**
 * PIN check: whether we deliver there, with what checkout will actually use — the fee, the
 * free-delivery amount, the EFFECTIVE minimum order (area vs store-wide, the higher one) and the
 * next bookable delivery slots.
 */
export const GET = route(async (req) => {
  const pin = normalizePincode(new URL(req.url).searchParams.get("pincode") ?? "");
  if (!isValidPincode(pin)) throw badRequest("Enter a valid 6-digit PIN code.");
  const area = await getArea(pin);
  if (!area) return json({ pincode: pin, serviceable: false, area: null, nextSlots: [] });
  const s = await getSettings();
  const nextSlots = (await getSlotOptions(s.slotDaysAhead)).filter((o) => o.available).slice(0, 3);
  return json({ pincode: pin, serviceable: true, area, nextSlots });
});

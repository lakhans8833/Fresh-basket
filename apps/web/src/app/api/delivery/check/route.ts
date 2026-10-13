import { isValidPincode, normalizePincode } from "@freshbasket/shared";
import { badRequest, json, route } from "@/lib/http";
import { getArea } from "@/lib/delivery";

export const GET = route(async (req) => {
  const pin = normalizePincode(new URL(req.url).searchParams.get("pincode") ?? "");
  if (!isValidPincode(pin)) throw badRequest("Enter a valid 6-digit PIN code.");
  const area = await getArea(pin);
  return json({ pincode: pin, serviceable: Boolean(area), area });
});

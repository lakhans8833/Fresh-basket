import { json, route } from "@/lib/http";
import { getSettings, supportedPaymentMethods } from "@/lib/settings";

export const GET = route(async () => {
  const s = await getSettings();
  return json({ settings: s, paymentMethods: supportedPaymentMethods(s) });
});

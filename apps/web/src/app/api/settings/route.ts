import { json, route } from "@/lib/http";
import { getSettings, supportedPaymentMethods, whatsappPaymentMethods } from "@/lib/settings";

export const GET = route(async () => {
  const s = await getSettings();
  return json({ settings: s, paymentMethods: supportedPaymentMethods(s), whatsappPaymentMethods: whatsappPaymentMethods(s) });
});

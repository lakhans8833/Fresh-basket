import { json, route } from "@/lib/http";
import { getSettings, supportedPaymentMethods, whatsappPaymentMethods } from "@/lib/settings";

export const GET = route(async () => {
  const s = await getSettings();
  // The store's phone number is not published (owner's choice): the app gets no number to show.
  return json({ settings: { ...s, supportPhone: null }, paymentMethods: supportedPaymentMethods(s), whatsappPaymentMethods: whatsappPaymentMethods(s) });
});

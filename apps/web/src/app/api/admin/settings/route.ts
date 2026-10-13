import { adminSettingsSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminSaveSettings } from "@/lib/admin/config";
import { getSettings } from "@/lib/settings";
import { env } from "@/lib/env";

export const GET = route(async () => {
  await requireAdmin();
  return json({
    settings: await getSettings(),
    services: {
      auth: env.auth.mode,
      storage: env.storage.mode,
      payments: env.payments.online,
      razorpayKeyIdSet: Boolean(env.payments.razorpayKeyId),
      webhookSecretSet: Boolean(env.payments.razorpayWebhookSecret),
      cronSecretSet: Boolean(env.cronSecret),
    },
  });
});
export const PUT = route(async (req) => {
  await requireAdmin();
  await adminSaveSettings(await parseBody(req, adminSettingsSchema));
  return json({ ok: true });
});

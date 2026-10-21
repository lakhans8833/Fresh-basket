import { contactSchema } from "@freshbasket/shared";
import { clientIp, json, parseBody, rateLimit, route } from "@/lib/http";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const POST = route(async (req) => {
  await rateLimit(`contact:${clientIp(req)}`, 5, 10 * 60_000);
  const d = await parseBody(req, contactSchema);
  const s = await getSession();
  await query(
    "insert into support_messages (user_id, name, email, phone, order_number, message) values ($1,$2,$3,$4,$5,$6)",
    [s?.userId ?? null, d.name, d.email, d.phone || null, d.orderNumber || null, d.message],
  );
  return json({ ok: true }, { status: 201 });
});

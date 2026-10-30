import { z } from "zod";
import { upiReferenceSchema } from "@freshbasket/shared";
import { badRequest, clientIp, json, notFound, parseBody, rateLimit, route } from "@/lib/http";
import { getSession } from "@/lib/auth";
import { getMyOrder } from "@/lib/orders";
import { trackToken } from "@/lib/tokens";
import { submitUpiReference } from "@/lib/payments/upi";

const body = upiReferenceSchema.extend({ k: z.string().max(64).optional().nullable() });

/**
 * Customer sends the UPI reference (UTR) after paying. Allowed for the signed-in owner of the order
 * or with the order's secret tracking key. Never marks the order paid (staff verify first).
 */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success) throw badRequest("Invalid order.");
  await rateLimit(`upi-ref:${clientIp(req)}`, 12, 10 * 60_000);
  const { reference, k } = await parseBody(req, body);
  let allowed = trackToken.verify(id, k);
  if (!allowed) {
    const s = await getSession();
    allowed = Boolean(s && (await getMyOrder(s.userId, id)));
  }
  if (!allowed) throw notFound("Order not found.");
  return json(await submitUpiReference(id, reference));
});

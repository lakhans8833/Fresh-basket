import { z } from "zod";
import { MAX_LINES, MAX_QTY_PER_LINE } from "@freshbasket/shared";
import { json, route } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { reorderItems } from "@/lib/orders";

/** Optional: the customer's current basket, so "Buy again" tops it up within today's stock. */
const bodySchema = z.object({
  cart: z.array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(MAX_QTY_PER_LINE) })).max(MAX_LINES).optional().default([]),
});

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const s = await requireUser();
  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw ?? {});
  return json(await reorderItems(s.userId, (await params).id, parsed.success ? parsed.data.cart : []));
});

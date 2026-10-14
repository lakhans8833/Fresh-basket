import { z } from "zod";
import { json, parseBody, route } from "@/lib/http";
import { requireAdmin } from "@/lib/auth";
import { adminAddStandardSizes } from "@/lib/admin/catalog";

const schema = z.object({ productId: z.string().uuid().nullable().optional() });

/** Adds missing 100 g / 250 g / 500 g / 1 kg sizes to one product or to the whole catalogue. */
export const POST = route(async (req) => {
  await requireAdmin();
  const body = await parseBody(req, schema);
  return json(await adminAddStandardSizes(body.productId ?? null));
});

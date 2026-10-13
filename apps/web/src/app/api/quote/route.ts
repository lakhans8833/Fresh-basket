import { quoteRequestSchema } from "@freshbasket/shared";
import { json, parseBody, route } from "@/lib/http";
import { buildQuote, toQuoteResponse } from "@/lib/quote";
import { getSession } from "@/lib/auth";

/** Server-calculated basket totals. The client never computes prices. */
export const POST = route(async (req) => {
  const body = await parseBody(req, quoteRequestSchema);
  const session = await getSession();
  const ctx = await buildQuote(body, { userId: session?.userId ?? null });
  return json(toQuoteResponse(ctx));
});

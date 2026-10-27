import { quoteRequestSchema } from "@freshbasket/shared";
import { releaseExpiredSoon } from "@/lib/orders";
import { clientIp, json, parseBody, rateLimit, route } from "@/lib/http";
import { buildQuote, toQuoteResponse } from "@/lib/quote";
import { commonFreeAbove } from "@/lib/delivery";
import { getSession } from "@/lib/auth";

/** Server-calculated basket totals. The client never computes prices. */
export const POST = route(async (req) => {
  const body = await parseBody(req, quoteRequestSchema);
  // Coupon checks are rate-limited so codes can't be guessed by brute force.
  if (body.couponCode) await rateLimit(`quote-coupon:${clientIp(req)}`, 30, 60_000);
  await releaseExpiredSoon(); // abandoned unpaid orders give their stock / slot places back
  const session = await getSession();
  const ctx = await buildQuote(body, { userId: session?.userId ?? null });
  return json({ ...toQuoteResponse(ctx), commonFreeAbove: ctx.area ? null : await commonFreeAbove() });
});

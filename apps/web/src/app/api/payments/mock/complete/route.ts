import { randomUUID } from "node:crypto";
import { z } from "zod";
import { badRequest, forbidden, json, notFound, parseBody, route } from "@/lib/http";
import { env } from "@/lib/env";
import { getSession } from "@/lib/auth";
import { getOrderById } from "@/lib/orders";
import { payToken } from "@/lib/tokens";
import { processPaymentEvent } from "@/lib/payments/process";

/**
 * DEVELOPMENT TEST PAYMENTS ONLY — no money moves. Simulates the gateway sending a
 * webhook, and runs it through exactly the same processing code as a real webhook
 * (including duplicate-event protection). Unavailable when Razorpay keys are set or in production.
 */
const schema = z.object({ orderId: z.uuid(), outcome: z.enum(["success", "failure"]), eventId: z.string().max(80).optional() });

export const POST = route(async (req) => {
  if (env.payments.online !== "mock") throw forbidden("Test payments are disabled.");
  const body = await parseBody(req, schema);
  const order = await getOrderById(body.orderId);
  if (!order) throw notFound("Order not found.");
  const session = await getSession();
  const token = new URL(req.url).searchParams.get("t");
  if (session?.userId !== order.userId && !payToken.verify(order.id, token)) throw forbidden();
  if (order.paymentMethod !== "mock") throw badRequest("This order does not use test payments.");

  const paymentId = `mock_pay_${order.id.slice(0, 8)}`;
  const result = await processPaymentEvent({
    provider: "mock",
    eventId: body.eventId ?? `mock_evt_${randomUUID()}`,
    type: body.outcome === "success" ? "payment.captured" : "payment.failed",
    rawType: body.outcome === "success" ? "payment.captured" : "payment.failed",
    providerOrderId: `mock_order_${order.id.slice(0, 8)}`,
    paymentId: body.outcome === "success" ? paymentId : `${paymentId}_failed_${Date.now()}`,
    amount: order.total,
    orderId: order.id,
    payload: { simulated: true, outcome: body.outcome },
  });
  return json({ status: result });
});

import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { normaliseRazorpayEvent, processPaymentEvent } from "@/lib/payments/process";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { createHash } from "node:crypto";

/**
 * Razorpay webhook (configure in Dashboard → Webhooks with events payment.captured,
 * order.paid, payment.failed). Signature is verified on the raw body; each event is
 * stored once, so Razorpay's retries are harmless.
 */
export async function POST(req: Request) {
  if (env.payments.online !== "razorpay") return NextResponse.json({ error: "not configured" }, { status: 404 });
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }
  let body: Parameters<typeof normaliseRazorpayEvent>[0];
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const eventId = req.headers.get("x-razorpay-event-id") ?? createHash("sha256").update(raw).digest("hex");
  try {
    const result = await processPaymentEvent(normaliseRazorpayEvent(body, eventId));
    return NextResponse.json({ result });
  } catch (e) {
    console.error("[webhook:razorpay]", e);
    return NextResponse.json({ error: "processing failed" }, { status: 500 }); // Razorpay will retry
  }
}

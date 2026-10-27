import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { safeEqual } from "@/lib/tokens";
import { releaseExpired } from "@/lib/orders";
import { retryFailedNotifications } from "@/lib/notify/whatsapp";

/** Cancels unpaid online orders whose stock hold expired. Call every few minutes (Vercel Cron). */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (!env.cronSecret || !safeEqual(auth, `Bearer ${env.cronSecret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [released, notificationsRetried] = await Promise.all([releaseExpired(), retryFailedNotifications()]);
  return NextResponse.json({ released, notificationsRetried });
}

import "server-only";
import { after } from "next/server";
import { query, queryOne } from "../db";
import { env } from "../env";
import { cancelPaymentLinkAtRazorpay } from "./razorpay";

/**
 * When a payment-link order is cancelled, cancel its Razorpay Payment Link too, so the link still
 * sitting in the customer's WhatsApp can't take money for a cancelled order. Runs after the response;
 * failures are logged only (an unpaid link also expires on its own).
 */
export function cancelPaymentLinkFor(orderId: string) {
  const run = async () => {
    try {
      const o = await queryOne<{ link: string | null; method: string; payment_status: string }>(
        "select razorpay_payment_link_id as link, payment_method as method, payment_status from orders where id = $1",
        [orderId],
      );
      if (!o?.link || o.link.startsWith("creating:") || o.method !== "razorpay_link" || o.payment_status === "paid") return;
      await query("update orders set razorpay_payment_link_url = null where id = $1", [orderId]);
      if (env.payments.online === "razorpay") await cancelPaymentLinkAtRazorpay(o.link);
    } catch (e) {
      console.error("[razorpay] cancel payment link failed", orderId, e);
    }
  };
  try {
    after(run);
  } catch {
    void run();
  }
}

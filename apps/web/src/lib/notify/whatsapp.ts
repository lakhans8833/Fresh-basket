import "server-only";
import { after } from "next/server";
import { isValidIndianMobile, normalizePhone, type OrderStatus } from "@freshbasket/shared";
import { query, queryOne } from "../db";
import { env } from "../env";
import { trackUrlFor } from "../payments/start";

/**
 * Automatic WhatsApp order updates through the official WhatsApp Business Platform (Cloud API).
 * (wa.me links only open a chat for the customer to send themselves — they can't send anything
 * automatically, so they are not used here.)
 *
 * - Sent only when the customer ticked "Send me order updates on WhatsApp" and the mobile number
 *   is a valid Indian mobile.
 * - Business-initiated messages must use templates approved in WhatsApp Manager; each event needs
 *   its template name in an env var. Body parameters: {{1}} first name, {{2}} order number,
 *   {{3}} tracking link.
 * - order_notifications has one row per (order, event): saving a status twice or a retried webhook
 *   never sends twice. Failed sends are logged with the API error and retried at most 3 times.
 * - Never throws: a WhatsApp problem must not break order updates.
 */

export type NotifyEvent = "confirmed" | "packed" | "out_for_delivery" | "delivered";
export type NotifyResult = "sent" | "failed" | "skipped" | "duplicate" | "disabled";

export interface WhatsAppCloudConfig {
  accessToken?: string;
  phoneNumberId?: string;
  apiVersion: string;
  apiBase: string;
  language: string;
  templates: Partial<Record<NotifyEvent, string | undefined>>;
}

export function notifyEventForStatus(status: OrderStatus): NotifyEvent | null {
  return status === "placed" ? "confirmed" : status === "packed" || status === "out_for_delivery" || status === "delivered" ? status : null;
}

export function whatsappNotificationsEnabled(cfg: WhatsAppCloudConfig = env.whatsappCloud) {
  return Boolean(cfg.accessToken && cfg.phoneNumberId);
}

async function log(orderId: string, event: NotifyEvent, status: "skipped", error: string) {
  await query(
    `insert into order_notifications (order_id, channel, event, status, error) values ($1, 'whatsapp', $2, $3, $4)
     on conflict (order_id, channel, event) do nothing`,
    [orderId, event, status, error],
  );
}

export async function notifyOrderEvent(
  orderId: string,
  event: NotifyEvent,
  deps: { config?: WhatsAppCloudConfig; fetchImpl?: typeof fetch } = {},
): Promise<NotifyResult> {
  const cfg = deps.config ?? env.whatsappCloud;
  const template = cfg.templates[event];
  if (!whatsappNotificationsEnabled(cfg) || !template) return "disabled";
  try {
    const o = await queryOne<{ order_number: string; whatsapp_updates: boolean; phone: string | null; full_name: string | null }>(
      "select order_number, whatsapp_updates, address->>'phone' as phone, address->>'fullName' as full_name from orders where id = $1",
      [orderId],
    );
    if (!o) return "skipped";
    if (!o.whatsapp_updates) {
      await log(orderId, event, "skipped", "Customer did not opt in to WhatsApp updates");
      return "skipped";
    }
    if (!o.phone || !isValidIndianMobile(o.phone)) {
      await log(orderId, event, "skipped", "No valid Indian mobile number on the order");
      return "skipped";
    }
    const to = `91${normalizePhone(o.phone)}`;

    // Claim the (order, event) slot. A sent/sending/skipped row means someone already handled it;
    // a failed row may be retried (max 3 attempts, at least a minute apart), and so may a send stuck
    // in "sending" for 10+ minutes.
    const claim = await query<{ id: number }>(
      `insert into order_notifications (order_id, channel, event, status, recipient) values ($1, 'whatsapp', $2, 'sending', $3)
       on conflict (order_id, channel, event) do update
         set status = 'sending', attempts = order_notifications.attempts + 1, recipient = excluded.recipient, error = null, updated_at = now()
         where order_notifications.attempts < 3
           and ((order_notifications.status = 'failed' and order_notifications.updated_at < now() - interval '1 minute')
                -- a send that was cut off (function timed out) before recording its result
                or (order_notifications.status = 'sending' and order_notifications.updated_at < now() - interval '10 minutes'))
       returning id`,
      [orderId, event, to],
    );
    const rowId = claim[0]?.id;
    if (!rowId) return "duplicate";

    const firstName = (o.full_name ?? "").trim().split(/\s+/)[0]?.slice(0, 30) || "there";
    const body = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template,
        language: { code: cfg.language },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: firstName },
              { type: "text", text: o.order_number },
              { type: "text", text: trackUrlFor(orderId) },
            ],
          },
        ],
      },
    };
    let status: "sent" | "failed" = "failed";
    let messageId: string | null = null;
    let error: string | null = null;
    try {
      const res = await (deps.fetchImpl ?? fetch)(`${cfg.apiBase}/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string; code?: number } };
      if (res.ok && json.messages?.[0]?.id) {
        status = "sent";
        messageId = json.messages[0].id;
      } else {
        error = `HTTP ${res.status}${json.error?.code ? ` (code ${json.error.code})` : ""}: ${json.error?.message ?? "no message id returned"}`;
      }
    } catch (e) {
      error = `Request failed: ${(e as Error).message}`;
    }
    await query(
      "update order_notifications set status = $2, provider_message_id = $3, error = $4, updated_at = now() where id = $1",
      [rowId, status, messageId, error?.slice(0, 500) ?? null],
    );
    if (error) console.error("[whatsapp] order update failed", orderId, event, error);
    return status;
  } catch (e) {
    console.error("[whatsapp] notification error", orderId, event, e);
    return "failed";
  }
}

/** Sends after the HTTP response (so customers/staff never wait for WhatsApp); outside a request, sends right away. */
export function scheduleOrderNotification(orderId: string, event: NotifyEvent | null) {
  if (!event || !whatsappNotificationsEnabled() || !env.whatsappCloud.templates[event]) return;
  const run = () => notifyOrderEvent(orderId, event).then(() => undefined);
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Retry WhatsApp updates that failed (e.g. WhatsApp briefly down) or got cut off mid-send — the
 * claim in notifyOrderEvent allows 3 attempts, a minute apart. Runs from the periodic sweep
 * (releaseExpiredSoon) and the cron; at most 10 per run. Never throws.
 */
export async function retryFailedNotifications(): Promise<number> {
  if (!whatsappNotificationsEnabled()) return 0;
  try {
    const rows = await query<{ order_id: string; event: NotifyEvent }>(
      `select order_id, event from order_notifications
        where channel = 'whatsapp' and attempts < 3
          and ((status = 'failed' and updated_at < now() - interval '1 minute')
               or (status = 'sending' and updated_at < now() - interval '10 minutes'))
        order by updated_at limit 10`,
    );
    for (const r of rows) {
      if (env.whatsappCloud.templates[r.event]) await notifyOrderEvent(r.order_id, r.event);
    }
    return rows.length;
  } catch (e) {
    console.error("[notify] retrying WhatsApp updates failed", e instanceof Error ? e.message : e);
    return 0;
  }
}

export async function orderNotifications(orderId: string) {
  return query<{ event: NotifyEvent; status: string; recipient: string | null; error: string | null; attempts: number; updatedAt: string }>(
    `select event, status, recipient, error, attempts, updated_at as "updatedAt" from order_notifications where order_id = $1 order by created_at`,
    [orderId],
  );
}

const TEMPLATE_ENV: Record<NotifyEvent, string> = {
  confirmed: "WHATSAPP_TEMPLATE_ORDER_CONFIRMED",
  packed: "WHATSAPP_TEMPLATE_ORDER_PACKED",
  out_for_delivery: "WHATSAPP_TEMPLATE_OUT_FOR_DELIVERY",
  delivered: "WHATSAPP_TEMPLATE_ORDER_DELIVERED",
};

/**
 * What the admin panel shows about automatic order updates: which events will be sent, and the exact
 * settings (env var NAMES only — never values) still missing on the server.
 */
export function notificationSetup(cfg: WhatsAppCloudConfig = env.whatsappCloud) {
  const missing: string[] = [];
  if (!cfg.accessToken) missing.push("WHATSAPP_CLOUD_ACCESS_TOKEN");
  if (!cfg.phoneNumberId) missing.push("WHATSAPP_CLOUD_PHONE_NUMBER_ID");
  const events = (Object.keys(TEMPLATE_ENV) as NotifyEvent[]).map((e) => ({ event: e, ready: whatsappNotificationsEnabled(cfg) && Boolean(cfg.templates[e]) }));
  for (const e of Object.keys(TEMPLATE_ENV) as NotifyEvent[]) if (!cfg.templates[e]) missing.push(TEMPLATE_ENV[e]);
  return {
    channel: "whatsapp" as const,
    configured: whatsappNotificationsEnabled(cfg),
    allEventsReady: events.every((e) => e.ready),
    events,
    missing,
  };
}

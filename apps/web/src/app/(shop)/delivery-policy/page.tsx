import type { Metadata } from "next";
import Link from "next/link";
import { formatINR, formatSlotTime } from "@freshbasket/shared";
import { getSettings } from "@/lib/settings";
import { listActiveDeliveryAreas, listActiveSlots } from "@/lib/delivery";
import { InfoPage } from "@/components/info/info-page";

export const metadata: Metadata = { title: "Delivery policy" };

function cutoffText(startTime: string, cutoffMinutes: number) {
  if (cutoffMinutes === 0) return "Until the slot starts";
  const [h = 0, m = 0] = startTime.split(":").map(Number);
  let mins = h * 60 + m - cutoffMinutes;
  let dayBefore = false;
  if (mins < 0) {
    mins += 24 * 60;
    dayBefore = true;
  }
  const t = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  return `${formatSlotTime(t)}${dayBefore ? " the day before" : " the same day"}`;
}

const th = "px-3 py-3 sm:px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted";
const td = "px-3 py-3 sm:px-4 align-top";

export default async function DeliveryPolicyPage() {
  const [s, areas, slots] = await Promise.all([getSettings(), listActiveDeliveryAreas(), listActiveSlots()]);

  return (
    <InfoPage
      eyebrow="Policies"
      title="Delivery policy"
      intro="Where we deliver, when, and what it costs. The tables below are always up to date with what checkout uses."
    >
      <section aria-labelledby="areas-h">
        <h2 id="areas-h" className="text-[1.375rem] font-semibold text-forest-900">Delivery areas</h2>
        <p className="mt-1 text-[0.9375rem] text-ink-soft">
          We currently deliver to these PIN codes. Delivery is free when your cart (after any discount) reaches the “free above” amount.
          {s.defaultMinOrder > 0 ? <> Every order must be at least {formatINR(s.defaultMinOrder)}; some areas have a higher minimum, shown below.</> : null}
        </p>
        {areas.length ? (
          <>
          <ul className="mt-4 space-y-3 sm:hidden">
            {areas.map((a) => (
              <li key={a.id} className="rounded-2xl border border-line bg-white p-4">
                <p className="font-semibold text-ink"><span className="tabular-nums">{a.pincode}</span> · {a.areaName}</p>
                <p className="text-sm text-muted">{a.city}</p>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div><dt className="text-xs text-muted">Delivery fee</dt><dd className="font-medium tabular-nums">{a.fee ? formatINR(a.fee) : "Free"}</dd></div>
                  <div><dt className="text-xs text-muted">Free above</dt><dd className="font-medium tabular-nums">{a.freeAbove !== null ? formatINR(a.freeAbove) : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Minimum order</dt><dd className="font-medium tabular-nums">{a.minOrder ? formatINR(a.minOrder) : "None"}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="mt-4 hidden overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white sm:block">
            <table className="w-full text-[0.9375rem]">
              <caption className="sr-only">Active delivery areas with fees and minimum order</caption>
              <thead className="bg-sage-50">
                <tr>
                  <th scope="col" className={th}>PIN code</th>
                  <th scope="col" className={th}>Area</th>
                  <th scope="col" className={`${th} text-right`}>Delivery fee</th>
                  <th scope="col" className={`${th} text-right`}>Free above</th>
                  <th scope="col" className={`${th} text-right`}>Minimum order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {areas.map((a) => (
                  <tr key={a.id}>
                    <th scope="row" className={`${td} text-left font-semibold tabular-nums text-ink`}>{a.pincode}</th>
                    <td className={td}><span className="text-ink">{a.areaName}</span><span className="block text-sm text-muted">{a.city}</span></td>
                    <td className={`${td} text-right tabular-nums`}>{a.fee ? formatINR(a.fee) : "Free"}</td>
                    <td className={`${td} text-right tabular-nums`}>{a.freeAbove !== null ? formatINR(a.freeAbove) : "—"}</td>
                    <td className={`${td} text-right tabular-nums`}>{a.minOrder ? formatINR(a.minOrder) : "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-sage-200 bg-white p-5 text-[0.9375rem] text-muted">We&apos;re not taking deliveries to any area at the moment. Please check back soon.</p>
        )}
      </section>

      <section aria-labelledby="slots-h" className="mt-10">
        <h2 id="slots-h" className="text-[1.375rem] font-semibold text-forest-900">Delivery slots</h2>
        <p className="mt-1 text-[0.9375rem] text-ink-soft">
          {s.slotDaysAhead <= 1 ? "You can book a slot for today only." : `You can book a slot for today or up to ${s.slotDaysAhead - 1} day${s.slotDaysAhead - 1 === 1 ? "" : "s"} ahead.`} Each slot closes for new orders at its cut-off time (India Standard Time), or earlier if it fills up.
        </p>
        {slots.length ? (
          <div className="mt-4 overflow-x-auto rounded-[var(--radius-card)] border border-line bg-white">
            <table className="w-full text-[0.9375rem]">
              <caption className="sr-only">Delivery slots and ordering cut-off times</caption>
              <thead className="bg-sage-50">
                <tr>
                  <th scope="col" className={th}>Slot</th>
                  <th scope="col" className={th}>Delivery window</th>
                  <th scope="col" className={th}>Order by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {slots.map((sl) => (
                  <tr key={sl.id}>
                    <th scope="row" className={`${td} text-left font-semibold text-ink`}>{sl.label}</th>
                    <td className={`${td} tabular-nums`}>{formatSlotTime(sl.startTime)} – {formatSlotTime(sl.endTime)}</td>
                    <td className={`${td} tabular-nums`}>{cutoffText(sl.startTime, sl.cutoffMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-sage-200 bg-white p-5 text-[0.9375rem] text-muted">No delivery slots are open at the moment.</p>
        )}
      </section>

      <div className="prose-policy mt-4">
        <h2>Good to know</h2>
        <ul>
          <li>Delivery fees and minimum order amounts apply per order and depend on the delivery PIN code. Your checkout shows the exact fee before you pay.</li>
          <li>Please make sure someone is available to receive the order during the chosen slot, and that the mobile number on the address is reachable.</li>
          <li>Occasionally a delivery may run late because of weather, traffic or other circumstances outside our control. If that happens we&apos;ll do our best to let you know.</li>
          <li>You can cancel an order online until we start packing it. See <Link href="/help#cancellations" className="font-medium text-leaf-600 underline underline-offset-4">cancellations &amp; refunds</Link>.</li>
          <li>If something is wrong with your delivery, please see our <Link href="/returns" className="font-medium text-leaf-600 underline underline-offset-4">returns &amp; refunds policy</Link> or <Link href="/contact" className="font-medium text-leaf-600 underline underline-offset-4">contact us</Link>.</li>
        </ul>
      </div>
    </InfoPage>
  );
}

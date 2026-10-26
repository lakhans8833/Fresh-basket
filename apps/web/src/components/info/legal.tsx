import type { StoreSettings } from "@freshbasket/shared";

/** "27 October 2026" for the policy pages' "Last updated" line; null when the owner hasn't set a date. */
export function policyDate(s: StoreSettings): string | null {
  const d = s.legal.updated;
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * "Rams Fresh Basket is operated by X (GSTIN …), Address." built only from the details the owner entered
 * in Admin → Settings → Legal & policies — anything missing is left out, never filled with a guess.
 */
export function operatorSentence(s: StoreSettings): string | null {
  const l = s.legal;
  if (!l.name) return null;
  const reg = l.registration ? ` (${l.registration})` : "";
  const addr = l.address ? `, ${l.address.replace(/\s*\n\s*/g, ", ")}` : "";
  return `${s.storeName} is operated by ${l.name}${reg}${addr}.`;
}

/** Grievance officer block (Consumer Protection (E-Commerce) Rules, 2020 / DPDP Act, 2023) — only when filled in. */
export function Grievance({ s, a }: { s: StoreSettings; a: string }) {
  const l = s.legal;
  if (!l.grievanceOfficer && !l.grievanceEmail) return null;
  return (
    <p>
      <strong>Grievance officer</strong>: {l.grievanceOfficer ?? "—"}
      {l.grievanceEmail ? (
        <>
          {" · "}
          <a href={`mailto:${l.grievanceEmail}`} className={a}>{l.grievanceEmail}</a>
        </>
      ) : null}
    </p>
  );
}

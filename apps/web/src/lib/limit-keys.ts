/** Keys for rate limits, so trivial variations don't count as a different caller or recipient. */

/** IPv6 addresses are grouped by their /64 (one home/mobile connection usually owns a whole /64). */
export function ipLimitKey(ip: string): string {
  const s = ip.trim().toLowerCase();
  if (!s.includes(":")) return s;
  const v4 = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) return v4[1]!;
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t];
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

/**
 * The wider IPv6 network (/48) of a key from ipLimitKey; IPv4 keys come back unchanged. Not used as a
 * limit on its own (a mobile carrier can put many customers in one /48), only to tell "the same
 * place" apart from "anywhere else" — e.g. someone requesting codes for an address from far away.
 */
export function ipNetworkKey(ipKey: string): string {
  const m = ipKey.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4}):([0-9a-f]{1,4}):[0-9a-f]{1,4}::\/64$/);
  return m ? `${m[1]}:${m[2]}:${m[3]}::/48` : ipKey;
}

/** One mailbox = one key: lower-case, "+tag" removed, and Gmail's ignored dots removed. */
export function emailLimitKey(email: string): string {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  let user = local.split("+")[0]!;
  let host = domain;
  if (host === "gmail.com" || host === "googlemail.com") {
    user = user.replace(/\./g, "");
    host = "gmail.com";
  }
  return `${user}@${host}`;
}

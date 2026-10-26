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

import { describe, expect, it } from "vitest";
import { emailLimitKey, ipLimitKey } from "@/lib/limit-keys";

describe("rate-limit keys", () => {
  it("one mailbox, one key", () => {
    expect(emailLimitKey("A.B+promo@GMail.com")).toBe("ab@gmail.com");
    expect(emailLimitKey("ab@googlemail.com")).toBe("ab@gmail.com");
    expect(emailLimitKey("a.b+x@example.com")).toBe("a.b@example.com"); // dots matter outside Gmail
  });
  it("IPv4 as is; IPv6 grouped by /64", () => {
    expect(ipLimitKey("203.0.113.7")).toBe("203.0.113.7");
    expect(ipLimitKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(ipLimitKey("2001:db8:1:2::1")).toBe(ipLimitKey("2001:0db8:0001:0002:ffff:ffff:ffff:ffff"));
    expect(ipLimitKey("2001:db8:1:2::1")).not.toBe(ipLimitKey("2001:db8:1:3::1"));
    expect(ipLimitKey("::1")).toBe("0:0:0:0::/64");
    expect(ipLimitKey("local")).toBe("local");
  });
});

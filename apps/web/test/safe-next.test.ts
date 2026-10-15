import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-next";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/checkout")).toBe("/checkout");
    expect(safeNextPath("/reset-password?next=%2Fadmin%2Flogin")).toBe("/reset-password?next=%2Fadmin%2Flogin");
    expect(safeNextPath("/admin/orders?status=late", "/admin")).toBe("/admin/orders?status=late");
  });
  it("blocks redirects to other sites", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "\\\\evil.com", "https://evil.com", "javascript:alert(1)", "/\tevil", "", null, undefined]) {
      expect(safeNextPath(bad as string)).toBe("/account");
    }
  });
});

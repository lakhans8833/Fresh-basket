import { describe, expect, it } from "vitest";
import { formatINR } from "../src/money";

describe("formatINR", () => {
  it("shows whole rupees without decimals and paise with two decimals", () => {
    expect(formatINR(6000)).toBe("₹60");
    expect(formatINR(3120)).toBe("₹31.20");
    expect(formatINR(1333)).toBe("₹13.33");
    expect(formatINR(12345600)).toBe("₹1,23,456");
    expect(formatINR(0)).toBe("₹0");
  });
});

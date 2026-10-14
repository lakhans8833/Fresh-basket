import { describe, expect, it } from "vitest";
import { stateForPincode, stateMatchesPincode } from "../src/pincode";
import { addressInputSchema } from "../src/schemas";

const addr = (o: Record<string, unknown> = {}) => ({
  label: "Home", fullName: "Deepak Bisht", phone: "9876543210", line1: "A-24/5, MCCI", city: "Faridabad", state: "Haryana", pincode: "121006", ...o,
});

describe("PIN code → state", () => {
  it("knows Faridabad, Delhi and Gurugram", () => {
    expect(stateForPincode("121006")).toBe("Haryana");
    expect(stateForPincode("110001")).toBe("Delhi");
    expect(stateForPincode("122001")).toBe("Haryana");
    expect(stateForPincode("201301")).toBe("Uttar Pradesh");
  });
  it("returns null for mixed or unknown ranges", () => {
    expect(stateForPincode("160055")).toBeNull(); // Chandigarh / Mohali
    expect(stateForPincode("800001")).toBeNull();
    expect(stateForPincode("12345")).toBeNull();
  });
  it("accepts spelling variants and short forms", () => {
    expect(stateMatchesPincode("haryana", "121006")).toBe(true);
    expect(stateMatchesPincode("HR", "121006")).toBe(true);
    expect(stateMatchesPincode("NCT of Delhi", "110092")).toBe(true);
    expect(stateMatchesPincode("Delhi", "121006")).toBe(false);
    expect(stateMatchesPincode("Anything", "800001")).toBe(true);
  });
});

describe("address schema", () => {
  it("rejects a Delhi address with a Faridabad PIN", () => {
    const r = addressInputSchema.safeParse(addr({ city: "New Delhi", state: "Delhi" }));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["state"]);
    expect(r.error?.issues[0]?.message).toContain("Haryana");
  });
  it("accepts the correct state", () => {
    expect(addressInputSchema.safeParse(addr()).success).toBe(true);
  });
});

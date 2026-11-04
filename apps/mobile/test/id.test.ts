/** FB-36: idempotency keys must come from a secure random source on Hermes (no crypto.randomUUID there). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const ec = vi.hoisted(() => ({ calls: 0 }));
vi.mock("expo-crypto", () => ({ randomUUID: () => { ec.calls++; return randomUUID(); } }));

afterEach(() => vi.restoreAllMocks());

describe("randomId", () => {
  it("uses expo-crypto's randomUUID, never Math.random (Hermes has no global crypto.randomUUID)", async () => {
    const original = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    const rnd = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      const { randomId } = await import("../src/lib/id");
      const a = randomId();
      const b = randomId();
      expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(a).not.toBe(b);
      expect(ec.calls).toBe(2);
      expect(rnd).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
    }
  });
});

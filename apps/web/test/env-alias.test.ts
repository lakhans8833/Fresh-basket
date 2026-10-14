import { describe, expect, it } from "vitest";
import { envAlias } from "../src/lib/env-alias";

describe("envAlias", () => {
  it("prefers the exact name", () => {
    expect(envAlias("POSTGRES_URL", { POSTGRES_URL: "a", STORAGE_POSTGRES_URL: "b" })).toBe("a");
  });
  it("finds a prefixed server variable (Custom Prefix STORAGE)", () => {
    expect(envAlias("POSTGRES_URL", { STORAGE_POSTGRES_URL: "b", STORAGE_POSTGRES_URL_NON_POOLING: "c" })).toBe("b");
    expect(envAlias("SUPABASE_SERVICE_ROLE_KEY", { STORAGE_SUPABASE_SERVICE_ROLE_KEY: "k" })).toBe("k");
  });
  it("finds prefixed public variables in either position", () => {
    expect(envAlias("NEXT_PUBLIC_SUPABASE_URL", { NEXT_PUBLIC_STORAGE_SUPABASE_URL: "u1" })).toBe("u1");
    expect(envAlias("NEXT_PUBLIC_SUPABASE_URL", { STORAGE_NEXT_PUBLIC_SUPABASE_URL: "u2" })).toBe("u2");
  });
  it("never mixes public and server names, ignores empty values", () => {
    expect(envAlias("SUPABASE_URL", { NEXT_PUBLIC_STORAGE_SUPABASE_URL: "u" })).toBeUndefined();
    expect(envAlias("POSTGRES_URL", { STORAGE_POSTGRES_URL: "  " })).toBeUndefined();
    expect(envAlias("POSTGRES_URL", { POSTGRES_URL_NON_POOLING: "x" })).toBeUndefined();
  });
});

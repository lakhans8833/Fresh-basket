/**
 * FB-14: the Supabase session must not sit in plain AsyncStorage. LargeSecureStore: the session is
 * AES-encrypted in AsyncStorage, the key lives in expo-secure-store (Keychain / Keystore).
 * Runs in Node with in-memory stand-ins for AsyncStorage and SecureStore; the AES is real (aes-js).
 * Run: (cd apps/mobile && npx vitest run test)
 */
import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { createLargeSecureStore } from "../src/lib/large-secure-store";

const SESSION = JSON.stringify({ access_token: "eyJ.access.SECRET", refresh_token: "refresh-SECRET", user: { email: "a@test.local" } });
const KEY = "sb-abcdefgh-auth-token";

function setup() {
  const kv = new Map<string, string>();
  const keys = new Map<string, string>();
  const store = createLargeSecureStore({
    kv: { getItem: async (k) => kv.get(k) ?? null, setItem: async (k, v) => void kv.set(k, v), removeItem: async (k) => void kv.delete(k) },
    keys: { get: async (k) => keys.get(k) ?? null, set: async (k, v) => void keys.set(k, v), remove: async (k) => void keys.delete(k) },
    randomBytes: (n) => new Uint8Array(randomBytes(n)),
  });
  return { kv, keys, store };
}

describe("LargeSecureStore", () => {
  it("AsyncStorage never holds the tokens; the session reads back intact", async () => {
    const { kv, keys, store } = setup();
    await store.setItem(KEY, SESSION);
    const stored = kv.get(KEY)!;
    expect(stored).toBeTruthy();
    expect(stored).not.toContain("SECRET");
    expect(stored).not.toContain("access_token");
    expect([...keys.keys()].every((k) => /^[A-Za-z0-9._-]+$/.test(k))).toBe(true); // SecureStore's allowed key characters
    expect(keys.size).toBe(1);
    expect(await store.getItem(KEY)).toBe(SESSION);
  });

  it("a plain session saved by the previous app version is kept (no sign-out) and encrypted on first read", async () => {
    const { kv, store } = setup();
    kv.set(KEY, SESSION); // old version: plain JSON in AsyncStorage
    expect(await store.getItem(KEY)).toBe(SESSION);
    expect(kv.get(KEY)).not.toContain("SECRET");
    expect(await store.getItem(KEY)).toBe(SESSION);
  });

  it("removeItem deletes both the data and its key; a missing/wrong key means signed out, not a crash", async () => {
    const { kv, keys, store } = setup();
    await store.setItem(KEY, SESSION);
    await store.removeItem(KEY);
    expect(kv.has(KEY)).toBe(false);
    expect(keys.size).toBe(0);
    expect(await store.getItem(KEY)).toBe(null);

    await store.setItem(KEY, SESSION);
    keys.clear(); // e.g. Keystore wiped after a device restore
    expect(await store.getItem(KEY)).toBe(null);
    expect(kv.has(KEY)).toBe(false);

    await store.setItem(KEY, SESSION);
    for (const k of keys.keys()) keys.set(k, "00".repeat(32)); // wrong key
    expect(await store.getItem(KEY)).toBe(null);
  });

  it("every write uses a fresh key and IV (same session → different ciphertext)", async () => {
    const { kv, store } = setup();
    await store.setItem(KEY, SESSION);
    const a = kv.get(KEY);
    await store.setItem(KEY, SESSION);
    expect(kv.get(KEY)).not.toBe(a);
    expect(await store.getItem(KEY)).toBe(SESSION);
  });
});

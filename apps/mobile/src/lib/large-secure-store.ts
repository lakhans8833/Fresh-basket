/**
 * FB-14 "LargeSecureStore": storage for the Supabase session that keeps the tokens out of plain
 * AsyncStorage. SecureStore (Keychain / Android Keystore) only fits small values, so each value is
 * AES-256-CTR encrypted with a fresh random key + IV; the ciphertext goes to AsyncStorage and the key
 * to SecureStore. No React Native imports here (wired up in session-storage.ts, tested in Node).
 *
 * - A plain value saved by an older app version is returned as is and re-saved encrypted, so nobody is
 *   signed out by the update.
 * - Missing/wrong key or damaged data → null (= signed out) and the leftovers are removed; never a crash.
 * - Operations on the same key run one after another: supabase-js (lockless) can save twice at once, and
 *   interleaved writes could otherwise pair one save's key with the other's data (= signed out).
 */
import aesjs from "aes-js";

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
export interface SecretStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const PREFIX = "fbenc1:";
/** Prepended to the plaintext so a wrong key is detected instead of returning garbage. */
const MAGIC = "fb1|";

export function createLargeSecureStore(deps: { kv: KeyValueStore; keys: SecretStore; randomBytes: (n: number) => Uint8Array }): KeyValueStore {
  const { kv, keys, randomBytes } = deps;
  // SecureStore keys may only use letters, digits, ".", "-" and "_".
  const keyName = (k: string) => `fbk.${k.replace(/[^A-Za-z0-9._-]/g, "_")}`;
  const hex = aesjs.utils.hex;

  async function forget(key: string) {
    await kv.removeItem(key).catch(() => undefined);
    await keys.remove(keyName(key)).catch(() => undefined);
  }

  async function setItem(key: string, value: string) {
    const aesKey = randomBytes(32);
    const iv = randomBytes(16);
    const ctr = new aesjs.ModeOfOperation.ctr(aesKey, new aesjs.Counter(iv));
    const data = ctr.encrypt(aesjs.utils.utf8.toBytes(MAGIC + value));
    await keys.set(keyName(key), hex.fromBytes(aesKey));
    await kv.setItem(key, `${PREFIX}${hex.fromBytes(iv)}:${hex.fromBytes(data)}`);
  }

  async function getItem(key: string): Promise<string | null> {
    const raw = await kv.getItem(key);
    if (raw === null) return null;
    if (!raw.startsWith(PREFIX)) {
      // Saved in plain text by an older app version: keep the customer signed in, encrypt it now.
      await setItem(key, raw).catch(() => undefined);
      return raw;
    }
    try {
      const keyHex = await keys.get(keyName(key));
      const [ivHex, dataHex] = raw.slice(PREFIX.length).split(":");
      if (!keyHex || !ivHex || dataHex === undefined) throw new Error("incomplete");
      const ctr = new aesjs.ModeOfOperation.ctr(hex.toBytes(keyHex), new aesjs.Counter(hex.toBytes(ivHex)));
      const text = aesjs.utils.utf8.fromBytes(ctr.decrypt(hex.toBytes(dataHex)));
      if (!text.startsWith(MAGIC)) throw new Error("wrong key");
      return text.slice(MAGIC.length);
    } catch {
      await forget(key);
      return null;
    }
  }

  // One queue per key: each operation starts after the previous one on that key has finished.
  const queues = new Map<string, Promise<unknown>>();
  function serial<T>(key: string, op: () => Promise<T>): Promise<T> {
    const run = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(op);
    queues.set(key, run);
    void run.finally(() => {
      if (queues.get(key) === run) queues.delete(key);
    }).catch(() => undefined);
    return run;
  }

  return {
    getItem: (key) => serial(key, () => getItem(key)),
    setItem: (key, value) => serial(key, () => setItem(key, value)),
    removeItem: (key) => serial(key, () => forget(key)),
  };
}

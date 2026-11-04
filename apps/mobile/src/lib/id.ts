import { randomUUID } from "expo-crypto";

/**
 * Random id for idempotency keys. FB-36: Hermes has no global crypto.randomUUID, and the old fallback used
 * Math.random (predictable, can repeat). expo-crypto's randomUUID uses the OS secure random generator on
 * Android/iOS (and crypto.randomUUID on web).
 */
export function randomId(): string {
  return randomUUID();
}

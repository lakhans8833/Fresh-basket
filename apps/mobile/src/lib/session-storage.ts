import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { getRandomBytes } from "expo-crypto";
import { Platform } from "react-native";
import { createLargeSecureStore, type KeyValueStore } from "./large-secure-store";

/**
 * Where the Supabase session is kept (FB-14). Phones: encrypted in AsyncStorage, key in the
 * Keychain / Keystore (see large-secure-store.ts). Web (Expo web build only): the browser has no
 * SecureStore, so it stays in AsyncStorage (localStorage) as before.
 */
export const supabaseSessionStore: KeyValueStore =
  Platform.OS === "web"
    ? AsyncStorage
    : createLargeSecureStore({
        kv: AsyncStorage,
        keys: { get: (k) => SecureStore.getItemAsync(k), set: (k, v) => SecureStore.setItemAsync(k, v), remove: (k) => SecureStore.deleteItemAsync(k) },
        randomBytes: (n) => getRandomBytes(n),
      });

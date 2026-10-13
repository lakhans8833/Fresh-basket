import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** Secret values (dev session token): Keychain/Keystore on native, AsyncStorage on web. */
export const secureStorage = {
  async get(key: string): Promise<string | null> {
    try {
      if (Platform.OS === "web") return await AsyncStorage.getItem(key);
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") return AsyncStorage.setItem(key, value);
    return SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    try {
      if (Platform.OS === "web") return await AsyncStorage.removeItem(key);
      return await SecureStore.deleteItemAsync(key);
    } catch {
      /* ignore */
    }
  },
};

export async function readJSON<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeJSON(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / unavailable: keep working in memory */
  }
}

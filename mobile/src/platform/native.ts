/** React Native (Expo) implementation of the platform adapters. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { API_URL } from "../config";
import { LocationError, type Geolocator, type Haptics as HapticsPort, type KeyValueStorage, type Platform, type Realtime, type Sound } from "./types";

const GEO_TIMEOUT_MS = 8_000;

/**
 * The storage port is synchronous and AsyncStorage is not, so values live
 * in memory and are written through. `hydrateStorage()` loads them from disk
 * once, before the first screen renders.
 */
const memory = new Map<string, string>();

export async function hydrateStorage(keys: readonly string[]): Promise<void> {
  try {
    const pairs = await AsyncStorage.multiGet([...keys]);
    for (const [key, value] of pairs) if (value !== null) memory.set(key, value);
  } catch {
    /* first run or storage unavailable: start empty */
  }
}

const storage: KeyValueStorage = {
  get: (key) => memory.get(key) ?? null,
  set(key, value) {
    memory.set(key, value);
    void AsyncStorage.setItem(key, value).catch(() => undefined);
  },
  remove(key) {
    memory.delete(key);
    void AsyncStorage.removeItem(key).catch(() => undefined);
  },
};

const geolocation: Geolocator = {
  async current() {
    let permission;
    try {
      permission = await Location.requestForegroundPermissionsAsync();
    } catch {
      throw new LocationError("unavailable");
    }
    if (!permission.granted) throw new LocationError("denied");
    try {
      const fix = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new LocationError("timeout")), GEO_TIMEOUT_MS)),
      ]);
      return { lat: fix.coords.latitude, lng: fix.coords.longitude };
    } catch (error) {
      throw error instanceof LocationError ? error : new LocationError("unavailable");
    }
  },
};

const haptics: HapticsPort = {
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
};

/** The citizen app plays no alarm (that is the dispatcher console's job). */
const sound: Sound = { unlock: () => undefined, alarm: () => undefined };

const realtime: Realtime = {
  url: (path) => `${API_URL.replace(/^http/, "ws")}${path}`,
};

export const nativePlatform: Platform = {
  storage,
  geolocation,
  haptics,
  sound,
  realtime,
  uuid: () => Crypto.randomUUID(),
};

/**
 * Platform adapters. Screens and stores call these interfaces; only the
 * implementation in `web.ts` touches browser APIs. A React Native build
 * supplies its own implementation (AsyncStorage/MMKV, expo-location,
 * expo-haptics, expo-av) and nothing else changes.
 */

/** Synchronous key-value storage for small strings (ids, flags, preferences). */
export interface KeyValueStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface Position {
  lat: number;
  lng: number;
}

export type LocationFailure = "denied" | "unavailable" | "timeout";

export class LocationError extends Error {
  constructor(public reason: LocationFailure) {
    super(reason);
  }
}

export interface Geolocator {
  /** One position fix. Rejects with `LocationError`. */
  current(): Promise<Position>;
}

export interface Haptics {
  /** Something changed that the person must notice (route changed). */
  warning(): void;
  /** An action went through (SOS sent, marked safe). */
  success(): void;
}

export interface Sound {
  /** Call from a user gesture once, so later alarms are allowed to play. */
  unlock(): void;
  /** Short three-beep alarm for a RED alert or a Priority #1 SOS. */
  alarm(): void;
}

export interface Realtime {
  /** Absolute WebSocket URL for a server path such as `/ws/operator`. */
  url(path: string): string;
}

export interface Platform {
  storage: KeyValueStorage;
  geolocation: Geolocator;
  haptics: Haptics;
  sound: Sound;
  realtime: Realtime;
  /** Random UUID for the anonymous citizen id. */
  uuid(): string;
}

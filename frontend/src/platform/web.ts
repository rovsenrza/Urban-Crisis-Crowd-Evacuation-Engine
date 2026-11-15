/** Browser implementation of the platform adapters. The only file that touches browser APIs for these jobs. */
import { LocationError, type Geolocator, type Haptics, type KeyValueStorage, type Platform, type Realtime, type Sound } from "./types";

const GEO_TIMEOUT_MS = 8_000;

/** localStorage, falling back to memory when it is blocked (private mode, embedded views). */
function createStorage(): KeyValueStorage {
  const memory = new Map<string, string>();
  return {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        memory.set(key, value);
      }
    },
    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        memory.delete(key);
      }
    },
  };
}

const geolocation: Geolocator = {
  current() {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) return reject(new LocationError("unavailable"));
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        (error) =>
          reject(
            new LocationError(
              error.code === error.PERMISSION_DENIED ? "denied" : error.code === error.TIMEOUT ? "timeout" : "unavailable",
            ),
          ),
        { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS },
      );
    });
  },
};

const vibrate = (pattern: number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
};

const haptics: Haptics = {
  warning: () => vibrate([200, 100, 200]),
  success: () => vibrate([60]),
};

/** One shared AudioContext: browsers only let it play after a user gesture. */
function createSound(): Sound {
  let context: AudioContext | null = null;
  const ensure = (): AudioContext | null => {
    try {
      context ??= new AudioContext();
      if (context.state === "suspended") void context.resume();
      return context;
    } catch {
      return null;
    }
  };
  return {
    unlock: () => void ensure(),
    alarm() {
      const audio = ensure();
      if (!audio) return;
      [0, 0.28, 0.56].forEach((offset) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.type = "square";
        oscillator.frequency.value = 880;
        gain.gain.value = 0.08;
        oscillator.connect(gain).connect(audio.destination);
        oscillator.start(audio.currentTime + offset);
        oscillator.stop(audio.currentTime + offset + 0.16);
      });
    },
  };
}

const realtime: Realtime = {
  url(path) {
    const base = import.meta.env.VITE_WS_BASE as string | undefined;
    if (base) return `${base}${path}`;
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    return `${scheme}://${window.location.host}${path}`;
  },
};

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback for non-secure contexts (plain http on a LAN IP during a demo).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export const webPlatform: Platform = {
  storage: createStorage(),
  geolocation,
  haptics,
  sound: createSound(),
  realtime,
  uuid,
};

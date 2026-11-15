import { Platform } from "react-native";

/**
 * Where the backend lives.
 *
 * - iOS simulator: `localhost` is the Mac that runs it.
 * - Android emulator: the host machine is `10.0.2.2`, not `localhost`.
 * - Real phone: set EXPO_PUBLIC_API_URL to the machine's LAN address
 *   (for example http://192.168.1.20:8000) before `npx expo start`.
 */
const DEV_HOST = Platform.OS === "android" ? "10.0.2.2" : "localhost";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? `http://${DEV_HOST}:8000`).replace(/\/$/, "");

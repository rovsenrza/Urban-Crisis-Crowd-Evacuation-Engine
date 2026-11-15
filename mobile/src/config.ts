/**
 * Where the backend lives. On the iOS simulator `localhost` is the Mac that
 * runs it; on a real phone set EXPO_PUBLIC_API_URL to the Mac's LAN address
 * (for example http://192.168.1.20:8000) before `npx expo start`.
 */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");


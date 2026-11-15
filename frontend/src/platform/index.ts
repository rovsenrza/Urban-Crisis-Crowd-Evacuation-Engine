/**
 * The platform in use. Everything outside this folder imports `platform`
 * from here and never reaches for `localStorage`, `navigator` or
 * `AudioContext` itself.
 */
import { webPlatform } from "./web";

export const platform = webPlatform;
export { LocationError } from "./types";
export type { Platform, Position } from "./types";

/** Every storage key the app uses, in one place. */
export const STORAGE_KEYS = {
  locale: "evac.locale",
  citizenId: "evac.citizen_id",
  role: "evac.role",
  onboarded: "evac.onboarded",
  citizenZone: "evac.citizen.zone",
  citizenBanner: "evac.citizen.banner",
  operatorToken: "evac.operator_token",
  operatorFeed: "evac.operator.feed",
  operatorRole: "evac.operator.role",
  operatorName: "evac.operator.name",
} as const;

import type { Level, Thresholds } from "../api/types";
import { getLocale, t } from "../i18n";

/** Decimal separator of the active UI language. */
function decimal(value: string): string {
  return getLocale() === "az" ? value.replace(".", ",") : value;
}

export function formatDistance(metres: number): string {
  if (metres < 1000) return t("unit.m", { value: Math.round(metres / 10) * 10 });
  return t("unit.km", { value: decimal((metres / 1000).toFixed(1)) });
}

export function formatEta(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return t("unit.min", { value: minutes });
  const hours = Math.floor(minutes / 60);
  if (minutes % 60 === 0) return t("unit.hour", { hours });
  return t("unit.hourMin", { hours, minutes: minutes % 60 });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatPct(pct: number): string {
  return decimal(`${Math.round(pct * 10) / 10}`);
}

export function formatNumber(value: number): string {
  // Narrow no-break space as thousands separator (browser "az" locale data varies).
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f");
}

/** Same rule as the backend: green < yellow limit ≤ yellow ≤ red limit < red. */
export function occupancyLevel(pct: number, thresholds?: Thresholds): Level {
  const yellow = thresholds?.occupancy_yellow_pct ?? 70;
  const red = thresholds?.occupancy_red_pct ?? 90;
  if (pct < yellow) return "green";
  if (pct <= red) return "yellow";
  return "red";
}

const EARTH_RADIUS_M = 6_371_000;

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

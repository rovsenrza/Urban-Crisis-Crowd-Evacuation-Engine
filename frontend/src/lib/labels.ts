/** Localised display names for things whose stored name is Azerbaijani seed text. */
import { ApiError } from "../api/client";
import { t } from "../i18n";

const PLACEHOLDER_NAME = /^Yol \d+$/;

/**
 * Real street name when the street has one ("Niyazi küçəsi"); unnamed streets
 * are numbered in the UI language ("Yol 17" / "Road 17").
 */
export function roadName(edgeId: string, name?: string): string {
  if (name && !PLACEHOLDER_NAME.test(name)) return name;
  const number = Number(edgeId.replace(/\D/g, ""));
  return Number.isFinite(number) && number > 0 ? t("unit.road", { n: number }) : name ?? edgeId;
}

/** Proper names stay as they are; only the "(ehtiyat)" marker is translated. */
export function pointName(name: string): string {
  return name.replace("(ehtiyat)", `(${t("unit.reserveTag")})`);
}

export function brigadeName(name: string): string {
  return name.replace(/^Briqada/, t("unit.brigade"));
}

/** Server messages are Azerbaijani; known error codes are shown in the UI language. */
export function errorText(error: unknown): string {
  if (!(error instanceof ApiError)) return t("errors.generic");
  if (error.code === "network") return t("errors.network");
  return t(`errors.code.${error.code}`, { seconds: retryAfterSeconds(error.details) }, error.message);
}

/** Seconds to wait from a 429 answer's `details.retry_after_s`; empty when the server gave none. */
export function retryAfterSeconds(details: unknown): number | "" {
  const value = (details as { retry_after_s?: unknown } | null | undefined)?.retry_after_s;
  return typeof value === "number" ? Math.max(1, Math.ceil(value)) : "";
}

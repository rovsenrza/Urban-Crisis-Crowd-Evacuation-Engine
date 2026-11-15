import type { EvacuationOption, Level } from "../api/types";
import { t } from "../i18n";
import { formatDistance, formatEta, formatPct } from "../lib/format";

/** "62% · Space available": the level in words, so colour is never the only signal. */
export function occupancyText(pct: number, level: Level): string {
  return `${formatPct(pct)}% · ${t(`level.${level}`)}`;
}

export function routeSummary(option: EvacuationOption): string {
  return `${formatDistance(option.distance_m)} · ${formatEta(option.eta_s)}`;
}

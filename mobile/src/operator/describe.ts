/** Alert and decision wording, in the UI language. */
import type { Alert, ConfirmResult, Meta, Zone } from "../api/types";
import { t } from "../i18n";
import { formatDistance, formatEta, formatNumber, formatPct } from "../lib/format";
import { brigadeName, pointName } from "../lib/labels";

export const hazardLabel = (code: string, fallback?: string) => t(`hazard.${code}`, undefined, fallback ?? code);
export const ruleLabel = (alert: Alert) => t(`alert.rule.${alert.rule_id}`, undefined, alert.rule_id);
export const zoneNameOf = (zones: Zone[], id: string | null) => zones.find((z) => z.id === id)?.name ?? id ?? "";

export function describeAlert(alert: Alert, zones: Zone[], meta: Meta): string {
  const payload = alert.payload;
  if (alert.rule_id === "overcrowding") {
    return t("alert.overcrowding", {
      point: pointName(payload.point_name),
      pct: formatPct(payload.occupancy_pct),
      occupancy: formatNumber(payload.occupancy),
      capacity: formatNumber(payload.capacity),
    });
  }
  if (payload.scope === "radius") {
    return t("alert.clusterRadius", {
      radius: meta.thresholds.sos_cluster_radius_m,
      count: payload.count,
      zones: (payload.zone_ids as string[]).map((id) => zoneNameOf(zones, id)).join(", "),
    });
  }
  return t("alert.clusterZone", {
    zone: zoneNameOf(zones, alert.zone_id),
    count: payload.count,
    window: meta.thresholds.sos_cluster_window_min,
  });
}

/** The two things a confirmation did, as separate lines. */
export function decisionLines(actions: Alert["actions"]): string[] {
  return [
    actions.brigade_name
      ? t("alert.executedBrigade", {
          name: brigadeName(actions.brigade_name),
          distance: formatDistance(actions.brigade_distance_m ?? 0),
          eta: formatEta(actions.brigade_eta_s ?? 0),
        })
      : t("alert.executedNoBrigade"),
    actions.activated_point_name
      ? t("alert.executedPoint", { name: pointName(actions.activated_point_name) })
      : t("alert.executedNoPoint"),
    t("alert.executedReroute"),
  ];
}

export function decisionText(result: ConfirmResult): string {
  return `${t("alert.executed")}: ${decisionLines(result.alert.actions).join(" · ")}`;
}

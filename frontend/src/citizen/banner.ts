/**
 * Citizen banners. A banner is stored as data (a kind plus raw values), not
 * as text, so it follows the language switch and survives a refresh.
 */
import type { ReroutePush } from "../api/types";
import { t } from "../i18n";
import { formatPct } from "../lib/format";
import { pointName, roadName } from "../lib/labels";
import type { Tone } from "../ui";

export type BannerKind =
  | "road_closed"
  | "road_closed_point"
  | "point_full"
  | "alert_changed"
  | "alert_info"
  | "alert_plain"
  | "unreachable"
  | "error";

export interface CitizenBanner {
  tone: Tone;
  kind: BannerKind;
  data?: {
    edgeId?: string;
    edgeName?: string;
    point?: string;
    pct?: number;
    next?: string;
    code?: string;
    message?: string;
    /** Seconds until a rate-limited request may be retried. */
    seconds?: number;
  };
}

/** One banner per cause of a server-side re-route. */
export function rerouteBanner(push: ReroutePush): CitizenBanner {
  const next = push.plan.options.find((o) => o.point.id === push.plan.selected_point_id)?.point.name;
  if (!next) return { tone: "danger", kind: "unreachable" };
  const detail = push.detail;
  if (push.reason === "road_closed") {
    const moved = push.plan.selected_point_id !== push.previous_point_id;
    return {
      tone: "warn",
      kind: moved ? "road_closed_point" : "road_closed",
      data: { edgeId: detail.edge_id, edgeName: detail.edge_name, next },
    };
  }
  if (push.reason === "point_full") {
    return { tone: "warn", kind: "point_full", data: { point: detail.point_name, pct: detail.occupancy_pct, next } };
  }
  if (push.changed) return { tone: "warn", kind: "alert_changed", data: { next } };
  if (detail.activated_point_name) return { tone: "info", kind: "alert_info", data: { point: detail.activated_point_name } };
  return { tone: "info", kind: "alert_plain" };
}

/** Title and text of a banner in the current language. */
export function bannerContent(banner: CitizenBanner): { title: string; text: string } {
  const data = banner.data ?? {};
  if (banner.kind === "error") {
    const text =
      data.code === "network"
        ? t("errors.network")
        : data.code === "generic" || !data.code
          ? t("errors.generic")
          : t(`errors.code.${data.code}`, { seconds: data.seconds ?? "" }, data.message ?? t("errors.generic"));
    return { title: t("errors.title"), text };
  }
  const params = {
    edge: data.edgeId ? roadName(data.edgeId, data.edgeName) : "",
    point: data.point ? pointName(data.point) : "",
    next: data.next ? pointName(data.next) : "",
    pct: data.pct !== undefined ? formatPct(data.pct) : "",
  };
  const informational = banner.kind === "alert_info" || banner.kind === "alert_plain";
  return {
    title: t(informational ? "citizen.banner.titleInfo" : "citizen.banner.title"),
    text: t(`citizen.banner.${banner.kind}`, params),
  };
}

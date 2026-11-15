/** Dashboard state: one snapshot from REST, then WebSocket deltas. */
import {
  CRITICAL_PRIORITY,
  type Alert,
  type AssemblyPoint,
  type AuditEntry,
  type Brigade,
  type Roads,
  type ScenarioStatus,
  type Snapshot,
  type Sos,
  type WsMessage,
  type Zone,
} from "../api/types";
import { t } from "../i18n";
import { formatPct } from "../lib/format";
import { brigadeName, pointName, roadName } from "../lib/labels";

export type Tone = "info" | "warn" | "danger" | "ok";

export interface FeedItem {
  id: number;
  ts: string;
  tone: Tone;
  /** Rendered lazily so old entries follow the language switch. */
  render: () => string;
}

export interface DashboardState {
  loaded: boolean;
  zones: Zone[];
  points: AssemblyPoint[];
  brigades: Brigade[];
  sos: Sos[];
  alerts: Alert[];
  roads: Roads;
  audit: AuditEntry[];
  safeCitizens: number;
  feed: FeedItem[];
  scenario: ScenarioStatus | null;
}

export type Action =
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "audit"; audit: AuditEntry[] }
  | { type: "scenario"; scenario: ScenarioStatus }
  | { type: "ws"; message: WsMessage };

export const initialState: DashboardState = {
  loaded: false,
  zones: [],
  points: [],
  brigades: [],
  sos: [],
  alerts: [],
  roads: { nodes: [], edges: [] },
  audit: [],
  safeCitizens: 0,
  feed: [],
  scenario: null,
};

const FEED_LIMIT = 60;
let feedSequence = 0;

function withFeed(state: DashboardState, ts: string, tone: Tone, render: () => string): DashboardState {
  const item: FeedItem = { id: ++feedSequence, ts, tone, render };
  return { ...state, feed: [item, ...state.feed].slice(0, FEED_LIMIT) };
}

function replaceById<T extends { id: number | string }>(items: T[], item: T): T[] {
  return items.some((i) => i.id === item.id) ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item];
}

function hazardLabel(code: string): string {
  return t(`hazard.${code}`, undefined, code);
}

/** Priority #1 first, then newest first (same order as the API). */
function sortSos(signals: Sos[]): Sos[] {
  return [...signals].sort((a, b) => a.priority - b.priority || b.id - a.id);
}

/** Scenario progress text in the UI language (server text is the fallback). */
export function scenarioText(status: Pick<ScenarioStatus, "code" | "params" | "message">): string {
  return status.code ? t(`scenario.${status.code}`, status.params, status.message) : status.message;
}

function applyMessage(state: DashboardState, { type, ts, data }: WsMessage): DashboardState {
  const zoneName = (id: string | null) => state.zones.find((z) => z.id === id)?.name ?? id ?? "";
  switch (type) {
    case "sos.created": {
      const sos: Sos = data.sos;
      const critical = sos.priority === CRITICAL_PRIORITY;
      const zone = zoneName(sos.zone_id);
      const next = { ...state, sos: sortSos([sos, ...state.sos]) };
      return withFeed(next, ts, critical ? "danger" : "warn", () =>
        t(critical ? "feed.prioritySos" : "feed.sos", { zone, hazard: hazardLabel(sos.hazard_type) }),
      );
    }
    case "citizen.safe": {
      const resolved: number[] = data.resolved_sos_ids;
      const next = {
        ...state,
        sos: state.sos.filter((s) => !resolved.includes(s.id)),
        safeCitizens: state.safeCitizens + 1,
      };
      return withFeed(next, ts, "ok", () => t("feed.safe", { count: resolved.length }));
    }
    case "road.changed": {
      const edge = data.edge;
      const edges = replaceById(state.roads.edges, edge);
      const key = edge.is_open ? "feed.roadOpened" : "feed.roadClosed";
      const tone: Tone = edge.is_open ? "ok" : "warn";
      return withFeed({ ...state, roads: { ...state.roads, edges } }, ts, tone, () =>
        t(key, { name: roadName(edge.id, edge.name) }),
      );
    }
    case "assembly.occupancy": {
      const point: AssemblyPoint = data.point;
      return withFeed({ ...state, points: replaceById(state.points, point) }, ts, "info", () =>
        t("feed.occupancy", { point: pointName(point.name), pct: formatPct(point.occupancy_pct) }),
      );
    }
    case "assembly.activated": {
      const point: AssemblyPoint = data.point;
      const next = { ...state, points: replaceById(state.points, point) };
      return withFeed(next, ts, "ok", () => t("feed.activated", { point: pointName(point.name) }));
    }
    case "alert.raised": {
      const alert: Alert = data.alert;
      const next = { ...state, alerts: replaceById(state.alerts, alert) };
      return withFeed(next, ts, "danger", () =>
        t("feed.alertRaised", { id: alert.id, rule: t(`alert.rule.${alert.rule_id}`, undefined, alert.rule_id) }),
      );
    }
    case "alert.confirmed":
    case "alert.dismissed": {
      const alert: Alert = data.alert;
      const next = { ...state, alerts: state.alerts.filter((a) => a.id !== alert.id) };
      const confirmed = type === "alert.confirmed";
      return withFeed(next, ts, confirmed ? "ok" : "info", () =>
        confirmed
          ? t("feed.alertConfirmed", { id: alert.id, by: alert.resolved_by })
          : t("feed.alertDismissed", { id: alert.id, reason: alert.dismiss_reason }),
      );
    }
    case "brigade.changed": {
      const brigade: Brigade = data.brigade;
      const previous = state.brigades.find((b) => b.id === brigade.id);
      const next = { ...state, brigades: replaceById(state.brigades, brigade) };
      // Position ticks arrive every few seconds; only status changes are news.
      if (previous?.status === brigade.status) return next;
      return withFeed(next, ts, "info", () =>
        t("feed.brigade", { name: brigadeName(brigade.name), status: t(`brigadeStatus.${brigade.status}`) }),
      );
    }
    case "citizen.rerouted": {
      if (!data.changed) return state;
      const reason: string = data.reason;
      return withFeed(state, ts, "info", () => t("feed.rerouted", { reason: t(`feed.reason.${reason}`) }));
    }
    case "sim.progress": {
      const status: ScenarioStatus = data;
      return withFeed({ ...state, scenario: status }, ts, "info", () => scenarioText(status));
    }
    case "system.reset":
      return withFeed({ ...state, feed: [] }, ts, "info", () => t("feed.reset"));
    default:
      return state;
  }
}

export function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case "snapshot": {
      const s = action.snapshot;
      return {
        ...state,
        loaded: true,
        zones: s.zones,
        points: s.assembly_points,
        brigades: s.brigades,
        sos: sortSos(s.sos),
        alerts: [...s.alerts].sort((a, b) => a.id - b.id),
        roads: s.roads,
        audit: s.audit,
        safeCitizens: s.stats.safe_citizens,
      };
    }
    case "audit":
      return { ...state, audit: action.audit };
    case "scenario":
      return { ...state, scenario: action.scenario };
    case "ws":
      return applyMessage(state, action.message);
  }
}

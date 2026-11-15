/** Builds the dispatcher's map scene from dashboard state. No map library in here. */
import { CRITICAL_PRIORITY, type Meta, type RoadEdge } from "../api/types";
import { t } from "../i18n";
import { formatPct, formatTime, occupancyLevel } from "../lib/format";
import { brigadeName, pointName } from "../lib/labels";
import type { MapScene, MapTarget, SceneArea, SceneFocus, SceneMarker, SceneRoad } from "../map/scene";
import { hazardIcon, kindIcon } from "../ui/Icon";
import { hazardLabel } from "./describe";
import type { DashboardState } from "./state";

const HEAT_BASE_M = 500;
const HEAT_STEP_M = 140;
const HEAT_MAX_COUNT = 12;
const OVERCROWDING_RADIUS_M = 300;
/** Most SOS markers drawn at once. `state.sos` is sorted Priority #1 first, then newest, so those are kept. */
export const MAX_SOS_MARKERS = 300;

/** Closed roads are the only streets drawn over the tiles; the rest are selected by tapping near them. */
export function closedRoads(edges: RoadEdge[]): SceneRoad[] {
  return edges.filter((e) => !e.is_open).map((e) => ({ id: e.id, path: e.geometry, style: "closedRoad" as const }));
}

export function operatorScene(
  state: DashboardState,
  meta: Meta,
  closed: SceneRoad[],
  selection: MapTarget | null,
  focus: SceneFocus | null,
): MapScene {
  const sosByZone = new Map<string, number>();
  state.sos.forEach((s) => sosByZone.set(s.zone_id, (sosByZone.get(s.zone_id) ?? 0) + 1));

  const markers: SceneMarker[] = [];
  const areas: SceneArea[] = [];

  for (const zone of state.zones) {
    const count = sosByZone.get(zone.id) ?? 0;
    // Heat: a translucent disc per district, growing with its SOS count.
    if (count > 0) {
      areas.push({
        id: `heat-${zone.id}`,
        center: [zone.lat, zone.lng],
        radiusM: HEAT_BASE_M + HEAT_STEP_M * Math.min(count, HEAT_MAX_COUNT),
        style: "heatArea",
      });
    }
    markers.push({ id: `zone-${zone.id}`, kind: "zone", position: [zone.lat, zone.lng], label: zone.name, text: zone.name, count });
  }

  for (const alert of state.alerts) {
    areas.push({
      id: `alert-${alert.id}`,
      center: [alert.lat, alert.lng],
      radiusM: alert.rule_id === "sos_cluster" ? meta.thresholds.sos_cluster_radius_m : OVERCROWDING_RADIUS_M,
      style: "alertArea",
    });
  }

  for (const point of state.points) {
    markers.push({
      id: `point-${point.id}`,
      kind: "point",
      position: [point.lat, point.lng],
      label: point.is_active
        ? `${pointName(point.name)}, ${formatPct(point.occupancy_pct)}%`
        : `${pointName(point.name)}, ${t("operator.reserve")}, ${t("operator.inactive")}`,
      icon: kindIcon(point.kind),
      text: point.is_active ? `${formatPct(Math.round(point.occupancy_pct))}%` : "",
      tone: point.is_active ? occupancyLevel(point.occupancy_pct, meta.thresholds) : "off",
      selected: selection?.kind === "point" && selection.id === point.id,
      target: { kind: "point", id: point.id },
    });
  }

  for (const sos of state.sos.slice(0, MAX_SOS_MARKERS)) {
    const label = `SOS №${sos.id}, ${hazardLabel(sos.hazard_type)}, ${formatTime(sos.created_at)}`;
    const base = { id: `sos-${sos.id}`, position: [sos.lat, sos.lng] as [number, number], target: { kind: "sos" as const, id: sos.id } };
    if (sos.priority === CRITICAL_PRIORITY) {
      markers.push({ ...base, kind: "prioritySos", label: `${t("operator.prioritySos")}, ${label}` });
    } else {
      markers.push({ ...base, kind: "sos", label, icon: hazardIcon(sos.hazard_type), hazard: sos.hazard_type });
    }
  }

  for (const brigade of state.brigades) {
    markers.push({
      id: `brigade-${brigade.id}`,
      kind: "brigade",
      position: [brigade.lat, brigade.lng],
      label: `${brigadeName(brigade.name)}, ${t(`brigadeStatus.${brigade.status}`)}`,
      text: String(brigade.id).padStart(2, "0"),
      tone: brigade.status,
      target: { kind: "brigade", id: brigade.id },
    });
  }

  const lines = state.brigades
    .filter((b) => b.status === "en_route" && b.route.length > 1)
    .map((b) => ({ id: `brigade-route-${b.id}`, path: b.route, style: "brigadeRoute" as const }));

  let roads = closed;
  if (selection?.kind === "road") {
    const edge = state.roads.edges.find((e) => e.id === selection.id);
    if (edge) roads = [...closed, { id: `selected-${edge.id}`, path: edge.geometry, style: "selectedRoad" }];
  }

  return { markers, lines, areas, roads, focus };
}

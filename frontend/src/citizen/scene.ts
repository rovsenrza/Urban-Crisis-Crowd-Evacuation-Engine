/** Builds the citizen's map scene from session state. No map library in here. */
import type { EvacuationPlan, Roads } from "../api/types";
import { t } from "../i18n";
import { formatPct } from "../lib/format";
import { pointName } from "../lib/labels";
import type { Position } from "../platform";
import type { MapScene, SceneMarker, SceneRoad } from "../map/scene";
import { kindIcon } from "../ui/Icon";

interface Input {
  plan: EvacuationPlan | null;
  roads: Roads | null;
  /** Show streets with barriers (barrier-free profile). */
  showBarriers: boolean;
  /** A position tapped on the map, waiting for confirmation. */
  pending: Position | null;
  routeVersion: number;
}

/**
 * Citizens only see what matters to them: closed roads and, on the
 * barrier-free profile, streets they cannot use.
 */
export function citizenRoads(roads: Roads | null, showBarriers: boolean): SceneRoad[] {
  if (!roads) return [];
  const drawn: SceneRoad[] = [];
  for (const edge of roads.edges) {
    if (!edge.is_open) drawn.push({ id: edge.id, path: edge.geometry, style: "closedRoad" });
    else if (showBarriers && !edge.is_accessible) drawn.push({ id: edge.id, path: edge.geometry, style: "barrierRoad" });
  }
  return drawn;
}

export function citizenScene({ plan, pending, routeVersion }: Input, roads: SceneRoad[]): MapScene {
  const selected = plan?.options.find((o) => o.point.id === plan.selected_point_id);
  const markers: SceneMarker[] = [];

  for (const option of plan?.options ?? []) {
    const isSelected = option.point.id === plan?.selected_point_id;
    markers.push({
      id: `point-${option.point.id}`,
      kind: "point",
      position: [option.point.lat, option.point.lng],
      label: `${pointName(option.point.name)}, ${formatPct(option.point.occupancy_pct)}%`,
      icon: kindIcon(option.point.kind),
      text: `${formatPct(Math.round(option.point.occupancy_pct))}%`,
      tone: option.level,
      selected: isSelected,
      target: { kind: "point", id: option.point.id },
    });
  }
  if (plan) {
    markers.push({ id: "origin", kind: "origin", position: [plan.origin.lat, plan.origin.lng], label: t("citizen.yourLocation") });
  }
  if (pending) {
    markers.push({ id: "pending", kind: "pending", position: [pending.lat, pending.lng], label: t("citizen.map.pendingPin") });
  }

  const lines = selected
    ? [
        { id: "route-casing", path: selected.geometry, style: "routeCasing" as const },
        { id: "route", path: selected.geometry, style: plan?.accessible ? ("routeAccessible" as const) : ("route" as const) },
      ]
    : [];

  return {
    markers,
    lines,
    areas: [],
    roads,
    focus: selected
      ? { key: `route-${routeVersion}`, path: selected.geometry }
      : plan
        ? { key: `origin-${routeVersion}`, point: [plan.origin.lat, plan.origin.lng] }
        : null,
  };
}

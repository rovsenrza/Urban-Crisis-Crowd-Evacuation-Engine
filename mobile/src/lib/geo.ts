/** Small geometry helpers with no map library in them. */
import type { LatLng, RoadEdge } from "../api/types";

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG = 111_320;
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

/** Ground metres per screen pixel at a latitude and web-map zoom level. */
export function metresPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / 2 ** (zoom + 8);
}

/** Distance in metres from a point to a polyline (flat-earth approximation, fine at city scale). */
function distanceToPath(path: LatLng[], lat: number, lng: number): number {
  const kx = M_PER_DEG_LNG * Math.cos((lat * Math.PI) / 180);
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i += 1) {
    const ax = (path[i][1] - lng) * kx;
    const ay = (path[i][0] - lat) * M_PER_DEG_LAT;
    const bx = (path[i + 1][1] - lng) * kx;
    const by = (path[i + 1][0] - lat) * M_PER_DEG_LAT;
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy;
    const u = length2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2));
    best = Math.min(best, Math.hypot(ax + u * dx, ay + u * dy));
  }
  return best;
}

/**
 * The street nearest to a tapped position, or null when none is within
 * `maxM`. Lets a road be selected by tapping near it instead of exactly on a
 * thin line.
 */
export function nearestEdge(edges: RoadEdge[], lat: number, lng: number, maxM: number): RoadEdge | null {
  let best: RoadEdge | null = null;
  let bestDistance = maxM;
  for (const edge of edges) {
    const distance = distanceToPath(edge.geometry, lat, lng);
    if (distance < bestDistance) {
      best = edge;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * What a map shows, as plain data.
 *
 * Screens build a `MapScene` from their state (see `citizen/scene.ts` and
 * `operator/scene.ts`); `MapView` only draws it. A React Native build keeps
 * the scene builders and writes a second `MapView` on a native map.
 */
import type { LatLng } from "../api/types";
import type { MapAreaStyle, MapLineStyle } from "../design/tokens";
import type { IconName } from "../ui/Icon";

/** Something on the map the person can select. */
export type MapTarget =
  | { kind: "point"; id: number }
  | { kind: "sos"; id: number }
  | { kind: "brigade"; id: number }
  | { kind: "road"; id: string };

export type MarkerTone = "green" | "yellow" | "red" | "off";
export type BrigadeTone = "available" | "en_route" | "on_site" | "returning";

export type SceneMarker = { id: string; position: LatLng; /** Accessible name. */ label: string; target?: MapTarget } & (
  | { kind: "origin" }
  | { kind: "pending" }
  | { kind: "point"; icon: IconName; text: string; tone: MarkerTone; selected: boolean }
  | { kind: "sos"; icon: IconName; hazard: string }
  | { kind: "prioritySos"; selected?: boolean }
  | { kind: "brigade"; text: string; tone: BrigadeTone }
  | { kind: "zone"; text: string; count: number }
);

export interface SceneLine {
  id: string;
  path: LatLng[];
  style: MapLineStyle;
}

export interface SceneArea {
  id: string;
  center: LatLng;
  radiusM: number;
  style: MapAreaStyle;
}

/** A street segment drawn on top of the tiles (closed, with barriers, or selected). */
export interface SceneRoad {
  id: string;
  path: LatLng[];
  style: MapLineStyle;
}

/** Where the camera should go. It moves once each time `key` changes. */
export interface SceneFocus {
  key: string;
  /** Fit this path in view… */
  path?: LatLng[];
  /** …or centre on this position. */
  point?: LatLng;
}

export interface MapScene {
  markers: SceneMarker[];
  lines: SceneLine[];
  areas: SceneArea[];
  roads: SceneRoad[];
  focus: SceneFocus | null;
}

export const EMPTY_SCENE: MapScene = { markers: [], lines: [], areas: [], roads: [], focus: null };

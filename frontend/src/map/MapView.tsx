/**
 * Web map renderer (Leaflet). It draws a `MapScene` and reports presses;
 * it makes no decision about what to show.
 */
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import { AttributionControl, Circle, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LatLng } from "../api/types";
import { mapStyle, tokens, type MapLineStyle } from "../design/tokens";
import { metresPerPixel } from "../lib/geo";
import { markerIcon, markerZ } from "./markers";
import type { MapScene, MapTarget, SceneFocus, SceneRoad } from "./scene";
import "./map.css";

const OSM_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const MAX_FIT_ZOOM = 15;
const MIN_FOCUS_ZOOM = 13;
/** Consecutive tile errors, with no successful load in between, before the background counts as failing. */
const TILE_ERROR_LIMIT = 3;

// Stable objects per style name: Leaflet layers compare them by reference.
const LINE_OPTIONS = Object.fromEntries(
  (Object.keys(mapStyle) as (keyof typeof mapStyle)[]).map((name) => {
    const style = mapStyle[name];
    return [name, { color: style.color, weight: style.weight, opacity: style.opacity, dashArray: "dash" in style ? style.dash ?? undefined : undefined }];
  }),
) as Record<MapLineStyle, L.PathOptions>;

const AREA_OPTIONS = {
  alertArea: { ...areaOptions("alertArea"), className: "map-alert-area" },
  heatArea: areaOptions("heatArea"),
};

function areaOptions(name: "alertArea" | "heatArea"): L.PathOptions {
  const style = mapStyle[name];
  return { color: style.color, weight: style.weight, opacity: style.opacity, fillColor: style.color, fillOpacity: style.fillOpacity };
}

interface Props {
  scene: MapScene;
  center: LatLng;
  zoom: number;
  /** Accessible name of the map region. */
  label: string;
  zoomControl?: boolean;
  /** Corner for the map data credit; keep it clear of sheets. */
  attribution?: "topleft" | "bottomright";
  /** Leave room at the bottom for a docked sheet when fitting a route. */
  sheetInset?: boolean;
  /** A press on the map itself (not on a marker). `tolerance` is the tap tolerance in metres at this zoom. */
  onPress?: (lat: number, lng: number, toleranceM: number) => void;
  onSelect?: (target: MapTarget) => void;
  /** The tile server is an external service too: called with true when the background stops loading, false when it recovers. */
  onTilesFailing?: (failing: boolean) => void;
}

/** Map background tiles. Reports when the tile server stops answering, so the screen can say so. */
function Tiles({ onFailing }: { onFailing?: (failing: boolean) => void }) {
  const state = useRef({ errors: 0, failing: false });
  const latest = useRef(onFailing);
  latest.current = onFailing;
  const handlers = useMemo(() => {
    const report = (failing: boolean) => {
      if (state.current.failing === failing) return;
      state.current.failing = failing;
      latest.current?.(failing);
    };
    return {
      tileerror: () => {
        state.current.errors += 1;
        if (state.current.errors >= TILE_ERROR_LIMIT) report(true);
      },
      tileload: () => {
        state.current.errors = 0;
        report(false);
      },
    };
  }, []);
  return <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} eventHandlers={handlers} />;
}

function Press({ onPress }: { onPress: NonNullable<Props["onPress"]> }) {
  const map = useMapEvents({
    click: (event) => {
      const { lat, lng } = event.latlng;
      onPress(lat, lng, metresPerPixel(lat, map.getZoom()) * tokens.size.roadTapTolerance);
    },
  });
  return null;
}

/** Moves the camera once per focus key. */
function Focus({ focus, sheetInset }: { focus: SceneFocus | null; sheetInset: boolean }) {
  const map = useMap();
  const latest = useRef(focus);
  latest.current = focus;
  useEffect(() => {
    const target = latest.current;
    if (!target) return;
    const pad = tokens.size.mapPadding;
    if (target.path && target.path.length > 1) {
      map.fitBounds(target.path, {
        paddingTopLeft: [pad, pad],
        paddingBottomRight: [pad, sheetInset ? tokens.size.mapSheetInset : pad],
        maxZoom: MAX_FIT_ZOOM,
      });
    } else if (target.point) {
      map.flyTo(target.point, Math.max(map.getZoom(), MIN_FOCUS_ZOOM), { duration: tokens.motion.duration.slow / 1000 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.key]);
  return null;
}

/** Names the map for assistive tech and keeps it sized when the layout around it changes. */
function Housekeeping({ label }: { label: string }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    container.setAttribute("role", "application");
    container.setAttribute("aria-label", label);
  }, [map, label]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

/**
 * Street segments on one canvas. There can be over a thousand (every street
 * with barriers), so this talks to Leaflet directly and only touches
 * segments whose style changed.
 */
function RoadLayer({ roads }: { roads: SceneRoad[] }) {
  const map = useMap();
  const renderer = useMemo(() => L.canvas({ padding: 0.5 }), []);
  const group = useRef<L.LayerGroup | null>(null);
  const entries = useRef(new Map<string, { line: L.Polyline; style: MapLineStyle }>());

  useEffect(() => {
    const layer = L.layerGroup().addTo(map);
    group.current = layer;
    const known = entries.current;
    return () => {
      layer.remove();
      known.clear();
      group.current = null;
    };
  }, [map]);

  useEffect(() => {
    const layer = group.current;
    if (!layer) return;
    const seen = new Set<string>();
    for (const road of roads) {
      seen.add(road.id);
      const entry = entries.current.get(road.id);
      if (entry) {
        if (entry.style !== road.style) {
          entry.line.setStyle(LINE_OPTIONS[road.style]);
          entry.style = road.style;
        }
        continue;
      }
      const line = L.polyline(road.path, { ...LINE_OPTIONS[road.style], renderer, interactive: false });
      layer.addLayer(line);
      entries.current.set(road.id, { line, style: road.style });
    }
    for (const [id, entry] of entries.current) {
      if (!seen.has(id)) {
        layer.removeLayer(entry.line);
        entries.current.delete(id);
      }
    }
  }, [roads]);

  return null;
}

export function MapView({ scene, center, zoom, label, zoomControl = false, attribution = "bottomright", sheetInset = false, onPress, onSelect, onTilesFailing }: Props) {
  return (
    <MapContainer center={center} zoom={zoom} className="map-view" zoomControl={zoomControl} attributionControl={false}>
      <Tiles onFailing={onTilesFailing} />
      <AttributionControl position={attribution} prefix={false} />
      <Housekeeping label={label} />
      {onPress && <Press onPress={onPress} />}
      <Focus focus={scene.focus} sheetInset={sheetInset} />
      <RoadLayer roads={scene.roads} />

      {scene.areas.map((area) => (
        <Circle key={area.id} center={area.center} radius={area.radiusM} pathOptions={AREA_OPTIONS[area.style]} interactive={false} />
      ))}

      {scene.lines.map((line) => (
        // The key includes the style so Leaflet re-applies it when the profile changes.
        <Polyline key={`${line.id}-${line.style}`} positions={line.path} pathOptions={LINE_OPTIONS[line.style]} interactive={false} />
      ))}

      {scene.markers.map((marker) => {
        const target = marker.target;
        const pressable = Boolean(target && onSelect);
        return (
          <Marker
            key={marker.id}
            position={marker.position}
            icon={markerIcon(marker)}
            zIndexOffset={markerZ(marker)}
            title={marker.label}
            interactive={pressable}
            keyboard={pressable}
            eventHandlers={pressable ? { click: () => onSelect!(target!) } : undefined}
          />
        );
      })}
    </MapContainer>
  );
}

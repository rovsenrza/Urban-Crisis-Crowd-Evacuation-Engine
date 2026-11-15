/**
 * Native map renderer (react-native-maps: Apple Maps on iOS, Google Maps on
 * Android). It draws a `MapScene` and reports presses; like the web
 * renderer, it makes no decision about what to show.
 */
import { useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import NativeMap, { Circle, Marker, Polyline, type MapPressEvent, type Region } from "react-native-maps";
import type { LatLng } from "../api/types";
import { color, radius, shadows, size, space, type } from "../design/theme";
import { mapStyle, motion } from "../design/tokens";
import { Icon } from "../ui/Icon";
import type { MapScene, MapTarget, SceneFocus, SceneMarker } from "./scene";

const FOCUS_DELTA = 0.02;
const toCoordinate = ([latitude, longitude]: LatLng) => ({ latitude, longitude });
const dash = (pattern: string | null) => (pattern ? pattern.split(" ").map(Number) : undefined);

interface Props {
  scene: MapScene;
  center: LatLng;
  zoom: number;
  /** Accessible name of the map region. */
  label: string;
  /** Leave room at the bottom for a docked sheet when fitting a route. */
  sheetInset?: boolean;
  /** A press on the map itself (not on a marker). `toleranceM` is a finger-sized distance at the current zoom. */
  onPress?: (lat: number, lng: number, toleranceM: number) => void;
  onSelect?: (target: MapTarget) => void;
}

const MARKER_TONES = {
  green: { fill: color.ok, on: color.onOk },
  yellow: { fill: color.warn, on: color.onWarn },
  red: { fill: color.danger, on: color.onDanger },
  off: { fill: color.surface, on: color.inkMuted },
} as const;

const HAZARD_COLORS: Record<string, string> = {
  fire: color.hazardFire, collapse: color.hazardCollapse, flood: color.hazardFlood, medical: color.hazardMedical,
};
const BRIGADE_STATUS = { available: color.okSoft, en_route: color.warn, on_site: color.dangerSoft, returning: color.lineStrong } as const;

/** `#rrggbb` with an opacity, for overlays that have no separate opacity prop. */
function withOpacity(hex: string, opacity: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`;
}

/** The visible part of a marker. Looks follow the web markers in map.css. */
function MarkerView({ marker }: { marker: SceneMarker }) {
  switch (marker.kind) {
    case "origin":
      return <View style={styles.origin} />;
    case "pending":
      return <Icon name="pin" size="lg" color={color.accent} />;
    case "point": {
      const tone = MARKER_TONES[marker.tone];
      return (
        <View style={[styles.point, { backgroundColor: tone.fill }, marker.selected && styles.pointSelected]}>
          <Icon name={marker.icon} size="sm" color={tone.on} />
          {marker.text ? <Text style={[type.label, styles.pointText, { color: tone.on }]}>{marker.text}</Text> : null}
        </View>
      );
    }
    case "sos":
      return (
        <View style={[styles.sos, { backgroundColor: HAZARD_COLORS[marker.hazard] ?? color.hazardOther }]}>
          <Icon name={marker.icon} size="sm" color={color.inkInverse} />
        </View>
      );
    case "prioritySos":
      return (
        <View style={styles.prioritySos}>
          <Icon name="accessible" color={color.onPriority} />
          <View style={styles.priorityOne}>
            <Text style={[type.label, styles.priorityOneText]}>1</Text>
          </View>
        </View>
      );
    case "brigade":
      return (
        <View style={styles.brigade}>
          <Icon name="truck" size="sm" color={color.inkInverse} />
          <Text style={[type.label, styles.pointText, { color: color.inkInverse }]}>{marker.text}</Text>
          <View style={[styles.brigadeStatus, { backgroundColor: BRIGADE_STATUS[marker.tone] }]} />
        </View>
      );
    case "zone":
      return (
        <View style={[styles.zone, marker.count > 0 && styles.zoneHot]}>
          <Text style={[type.label, { color: marker.count > 0 ? color.ink : color.inkMuted }]}>{marker.text}</Text>
          {marker.count > 0 && (
            <View style={styles.zoneCount}>
              <Text style={[type.label, styles.pointText, { color: color.onDanger }]}>{marker.count}</Text>
            </View>
          )}
        </View>
      );
  }
}

const MARKER_Z = { origin: 10, pending: 10, prioritySos: 9, brigade: 8, sos: 7, point: 5, zone: 1 } as const;

export function MapView({ scene, center, zoom, label, sheetInset = false, onPress, onSelect }: Props) {
  const map = useRef<NativeMap>(null);
  const ready = useRef(false);
  const latitudeDelta = useRef(360 / 2 ** zoom);
  const latest = useRef<SceneFocus | null>(scene.focus);
  latest.current = scene.focus;
  // Degrees of longitude visible at a web-map zoom level, for the first frame.
  const delta = 360 / 2 ** zoom;

  const applyFocus = () => {
    const focus = latest.current;
    if (!focus || !map.current) return;
    const pad = size.mapPadding;
    if (focus.path && focus.path.length > 1) {
      map.current.fitToCoordinates(focus.path.map(toCoordinate), {
        edgePadding: { top: pad, right: pad, bottom: sheetInset ? size.mapSheetInset + pad : pad, left: pad },
        animated: true,
      });
    } else if (focus.point) {
      map.current.animateToRegion(
        { ...toCoordinate(focus.point), latitudeDelta: FOCUS_DELTA, longitudeDelta: FOCUS_DELTA },
        motion.duration.slow,
      );
    }
  };

  // Move the camera once each time the focus key changes.
  useEffect(() => {
    if (ready.current) applyFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.focus?.key]);

  const handlePress = (event: MapPressEvent) => {
    // iOS also reports marker presses here; those are handled by the marker.
    if (event.nativeEvent.action === "marker-press") return;
    const { latitude, longitude } = event.nativeEvent.coordinate;
    // About 4% of the visible height: roughly a fingertip, whatever the zoom.
    onPress?.(latitude, longitude, latitudeDelta.current * 111_000 * 0.04);
  };

  return (
    <NativeMap
      ref={map}
      style={StyleSheet.absoluteFill}
      accessibilityLabel={label}
      initialRegion={{ ...toCoordinate(center), latitudeDelta: delta, longitudeDelta: delta }}
      showsPointsOfInterests={false}
      showsCompass={false}
      toolbarEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      onMapReady={() => {
        ready.current = true;
        applyFocus();
      }}
      onRegionChangeComplete={(region: Region) => { latitudeDelta.current = region.latitudeDelta; }}
      onPress={handlePress}
    >
      {scene.areas.map((area) => (
        <Circle
          key={area.id}
          center={toCoordinate(area.center)}
          radius={area.radiusM}
          strokeColor={mapStyle[area.style].color}
          strokeWidth={mapStyle[area.style].weight}
          fillColor={withOpacity(mapStyle[area.style].color, mapStyle[area.style].fillOpacity)}
          zIndex={0}
        />
      ))}

      {scene.roads.map((road) => (
        <Polyline
          key={`${road.id}-${road.style}`}
          coordinates={road.path.map(toCoordinate)}
          strokeColor={withOpacity(mapStyle[road.style].color, mapStyle[road.style].opacity)}
          strokeWidth={mapStyle[road.style].weight}
          lineDashPattern={dash(mapStyle[road.style].dash)}
          zIndex={1}
        />
      ))}

      {scene.lines.map((line, index) => (
        <Polyline
          key={`${line.id}-${line.style}`}
          coordinates={line.path.map(toCoordinate)}
          strokeColor={mapStyle[line.style].color}
          strokeWidth={mapStyle[line.style].weight}
          lineDashPattern={dash(mapStyle[line.style].dash)}
          lineCap="round"
          lineJoin="round"
          zIndex={2 + index}
        />
      ))}

      {scene.markers.map((marker) => {
        const target = marker.target;
        // The key carries everything visible, so a changed marker is redrawn
        // while `tracksViewChanges` stays off (cheap on the map thread).
        const look =
          marker.kind === "point" ? `${marker.text}-${marker.tone}-${marker.selected}`
          : marker.kind === "brigade" ? `${marker.text}-${marker.tone}`
          : marker.kind === "zone" ? `${marker.text}-${marker.count}`
          : marker.kind;
        return (
          <Marker
            key={`${marker.id}-${look}`}
            coordinate={toCoordinate(marker.position)}
            anchor={{ x: 0.5, y: marker.kind === "pending" ? 1 : 0.5 }}
            centerOffset={marker.kind === "pending" ? { x: 0, y: -size.iconLg / 2 } : undefined}
            tracksViewChanges={false}
            accessibilityLabel={marker.label}
            zIndex={marker.kind === "point" && marker.selected ? 6 : MARKER_Z[marker.kind]}
            tappable={Boolean(target && onSelect)}
            onPress={target && onSelect ? () => onSelect(target) : undefined}
          >
            <View style={styles.hit}>
              <MarkerView marker={marker} />
            </View>
          </Marker>
        );
      })}
    </NativeMap>
  );
}

const styles = StyleSheet.create({
  // The hit box is always a full touch target; the visible part sits in its centre.
  hit: { minWidth: size.tap, minHeight: size.tap, alignItems: "center", justifyContent: "center" },
  origin: {
    width: size.markerOrigin,
    height: size.markerOrigin,
    borderRadius: radius.full,
    borderWidth: size.focusRing,
    borderColor: color.bg,
    backgroundColor: color.accent,
    ...shadows.raised,
  },
  point: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    height: size.markerPinHeight,
    paddingHorizontal: space[2],
    borderRadius: radius.full,
    borderWidth: size.borderStrong,
    borderColor: color.bg,
  },
  pointSelected: { height: size.markerPinHeight + space[2], borderColor: color.ink },
  pointText: { fontFamily: type.subheading.fontFamily },
  sos: {
    width: size.iconLg,
    height: size.iconLg,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    borderWidth: size.borderStrong,
    borderColor: color.bg,
  },
  prioritySos: {
    width: size.iconXl,
    height: size.iconXl,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    borderWidth: size.borderStrong,
    borderColor: color.bg,
    backgroundColor: color.priority,
  },
  priorityOne: {
    position: "absolute",
    top: -space[1],
    right: -space[1],
    width: size.iconSm,
    height: size.iconSm,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: color.bg,
  },
  priorityOneText: { color: color.priorityText, fontFamily: type.subheading.fontFamily },
  brigade: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    height: size.markerPinHeight,
    paddingHorizontal: space[2],
    borderRadius: radius.sm,
    borderWidth: size.borderStrong,
    borderColor: color.bg,
    backgroundColor: color.ink,
  },
  brigadeStatus: { width: space[2], height: space[2], borderRadius: radius.full },
  zone: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    paddingVertical: space[1],
    paddingHorizontal: space[2],
    borderRadius: radius.sm,
    backgroundColor: color.bg,
  },
  zoneHot: { ...shadows.raised },
  zoneCount: {
    minWidth: size.iconSm,
    height: size.iconSm,
    paddingHorizontal: space[1],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: color.danger,
  },
});

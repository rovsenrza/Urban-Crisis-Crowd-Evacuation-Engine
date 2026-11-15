import { StyleSheet, Text, View } from "react-native";
import type { Level } from "../api/types";
import { color, radius, size, space, type } from "../design/theme";

interface Props {
  /** 0–100. */
  pct: number;
  level: Level;
  /** Accessible name, e.g. "Occupancy". */
  label: string;
  /** Text shown next to the bar, e.g. "62% · Space available". Colour is never the only signal. */
  valueText: string;
  /** Marker lines (the 90% re-route and 95% critical limits). */
  marks?: number[];
  size?: "md" | "lg";
}

const LEVELS: Record<Level, { fill: string; text: string }> = {
  green: { fill: color.ok, text: color.okText },
  yellow: { fill: color.warn, text: color.warnText },
  red: { fill: color.danger, text: color.dangerText },
};

export function Meter({ pct, level, label, valueText, marks = [], size: meterSize = "md" }: Props) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <View
      style={styles.meter}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped), text: valueText }}
    >
      <View style={[styles.track, meterSize === "lg" && styles.trackLarge]}>
        <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: LEVELS[level].fill }]} />
        {marks.map((mark) => (
          <View key={mark} style={[styles.mark, { left: `${mark}%` }]} />
        ))}
      </View>
      <Text style={[type.smallMedium, { color: LEVELS[level].text }]}>{valueText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  meter: { flexDirection: "row", alignItems: "center", gap: space[3] },
  track: {
    flex: 1,
    minWidth: space[7],
    height: size.meter,
    borderRadius: radius.full,
    backgroundColor: color.surfaceSunken,
    overflow: "hidden",
  },
  trackLarge: { height: size.meterLg },
  fill: { height: "100%", borderRadius: radius.full },
  mark: { position: "absolute", top: 0, bottom: 0, width: size.borderStrong, backgroundColor: color.ink },
});

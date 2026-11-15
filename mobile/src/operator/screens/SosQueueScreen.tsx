import { router, type Href } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { CRITICAL_PRIORITY } from "../../api/types";
import { color, muted, radius, size, space, type } from "../../design/theme";
import { t } from "../../i18n";
import { formatTime } from "../../lib/format";
import { TopBar } from "../../shell/parts";
import { Badge, EmptyState, hazardIcon, Icon, List, ListRow } from "../../ui";
import { hazardLabel, zoneNameOf } from "../describe";
import { useOperator } from "../session";

const MAX_ROWS = 100;
const LIVE = "/operator/live" as Href;

/** Segment and legend colour per hazard code; unknown codes share the neutral one. */
const HAZARD_COLORS: Record<string, string> = {
  fire: color.hazardFire,
  collapse: color.hazardCollapse,
  flood: color.hazardFlood,
  medical: color.hazardMedical,
};
const hazardColor = (code: string) => HAZARD_COLORS[code] ?? color.hazardOther;

/**
 * SOS queue, Priority #1 first, then SOS by district.
 *
 * Read-only by design: the backend cannot resolve a single SOS or send a
 * brigade to one, so the only action is "show on the map".
 */
export function SosQueueScreen() {
  const { state, meta, showOnMap } = useOperator();
  const hazards = meta?.hazards ?? [];
  // A flood of signals must not freeze the console: the list draws the first
  // rows (Priority #1 is sorted first), the counts stay exact.
  const visible = state.sos.slice(0, MAX_ROWS);

  const districts = state.zones
    .map((zone) => ({ zone, signals: state.sos.filter((s) => s.zone_id === zone.id) }))
    .sort((a, b) => b.signals.length - a.signals.length || a.zone.name.localeCompare(b.zone.name, "az"));
  const max = Math.max(1, ...districts.map((d) => d.signals.length));

  return (
    <View style={styles.screen}>
      <TopBar
        title={t("sosQueue.title")}
        trailing={<Text style={[type.heading, muted]} accessibilityLabel={`${t("sosQueue.title")}: ${state.sos.length}`}>{state.sos.length}</Text>}
      />
      <ScrollView contentContainerStyle={styles.body}>
        {state.sos.length === 0 ? (
          <View style={styles.card}>
            <EmptyState icon="check" title={t("operator.noSos")}>{t("sosQueue.emptyText")}</EmptyState>
          </View>
        ) : (
          <View style={styles.card}>
            <List label={t("sosQueue.title")}>
              {visible.map((sos) => {
                const priority = sos.priority === CRITICAL_PRIORITY;
                return (
                  <ListRow
                    key={sos.id}
                    icon={priority ? "accessible" : hazardIcon(sos.hazard_type)}
                    tone={priority ? "priority" : "neutral"}
                    title={`№${sos.id} · ${zoneNameOf(state.zones, sos.zone_id)} · ${hazardLabel(sos.hazard_type)}`}
                    subtitle={priority ? t("operator.priorityCitizen") : undefined}
                    trailing={
                      <>
                        {priority && <Badge tone="priority" solid>{t("sosQueue.priority")}</Badge>}
                        <Text style={[type.small, muted]}>{formatTime(sos.created_at)}</Text>
                        <Icon name="map" size="sm" color={color.inkMuted} label={t("operator.showOnMap")} />
                      </>
                    }
                    onPress={() => {
                      showOnMap({ kind: "sos", id: sos.id }, [sos.lat, sos.lng]);
                      router.navigate(LIVE);
                    }}
                  />
                );
              })}
            </List>
          </View>
        )}
        {state.sos.length > visible.length && (
          <Text style={[type.small, muted]}>{t("sosQueue.shown", { shown: visible.length, total: state.sos.length })}</Text>
        )}

        <Text style={type.heading} accessibilityRole="header">{t("operator.sosByZone")}</Text>
        <View style={[styles.card, styles.padded]}>
          {districts.map(({ zone, signals }) => {
            const breakdown = hazards
              .map((hazard) => ({ hazard, count: signals.filter((s) => s.hazard_type === hazard.code).length }))
              .filter(({ count }) => count > 0);
            const quiet = signals.length === 0;
            return (
              <View
                key={zone.id}
                style={styles.district}
                accessible
                accessibilityLabel={`${zone.name}: ${signals.length}${breakdown.length ? `. ${breakdown.map(({ hazard, count }) => `${hazardLabel(hazard.code, hazard.label)} ${count}`).join(", ")}` : ""}`}
              >
                <View style={styles.districtRow}>
                  <Text style={[type.bodyMedium, styles.districtName, quiet && muted]} numberOfLines={1}>{zone.name}</Text>
                  {/* One segment per hazard type, coloured like the map markers. */}
                  <View style={styles.bar}>
                    {breakdown.map(({ hazard, count }) => (
                      <View key={hazard.code} style={{ width: `${(count / max) * 100}%`, backgroundColor: hazardColor(hazard.code) }} />
                    ))}
                  </View>
                  <Text style={[type.subheading, styles.count, quiet && muted]}>{signals.length}</Text>
                </View>
                {/* The same split in words, so colour is never the only signal. */}
                {breakdown.length > 0 && (
                  <Text style={[type.label, muted]}>
                    {breakdown.map(({ hazard, count }) => `${hazardLabel(hazard.code, hazard.label)} ${count}`).join(" · ")}
                  </Text>
                )}
              </View>
            );
          })}
          <View style={styles.legend}>
            {hazards.map((hazard) => (
              <View key={hazard.code} style={styles.legendItem}>
                <View style={[styles.swatch, { backgroundColor: hazardColor(hazard.code) }]}>
                  <Icon name={hazardIcon(hazard.code)} size="sm" color={color.inkInverse} />
                </View>
                <Text style={type.small}>{hazardLabel(hazard.code, hazard.label)}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space[4], gap: space[4] },
  card: { borderWidth: size.border, borderColor: color.line, borderRadius: radius.md, overflow: "hidden", backgroundColor: color.bg },
  padded: { padding: space[4], gap: space[3] },
  district: { gap: space[1] },
  districtRow: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: size.iconLg },
  districtName: { width: "32%" },
  bar: {
    flex: 1,
    flexDirection: "row",
    height: size.meterLg,
    borderRadius: radius.full,
    backgroundColor: color.surfaceSunken,
    overflow: "hidden",
  },
  count: { minWidth: size.iconLg, textAlign: "right" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space[3], marginTop: space[2] },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space[2] },
  swatch: { width: size.iconLg, height: size.iconLg, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
});

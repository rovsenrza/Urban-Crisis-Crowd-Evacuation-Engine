import { router, type Href } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { CRITICAL_PRIORITY, type BrigadeStatus, type Meta } from "../../api/types";
import { occupancyText } from "../../citizen/labels";
import { color, muted, size, space, type } from "../../design/theme";
import { t } from "../../i18n";
import { formatDistance, formatEta, formatNumber, formatTime, occupancyLevel } from "../../lib/format";
import { nearestEdge } from "../../lib/geo";
import { brigadeName, pointName, roadName } from "../../lib/labels";
import { MapView } from "../../map/MapView";
import { Badge, Button, DockedSheet, hazardIcon, Icon, IconButton, kindIcon, List, ListRow, Meter, ModalSheet } from "../../ui";
import { hazardLabel, zoneNameOf } from "../describe";
import { closedRoads, operatorScene } from "../scene";
import { useOperator } from "../session";

const BRIGADE_STATUSES: BrigadeStatus[] = ["available", "en_route", "on_site", "returning"];

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <View style={styles.fact}>
      <Text style={[type.small, muted]}>{label}</Text>
      <Text style={type.bodyMedium}>{children}</Text>
    </View>
  );
}

/** What is selected on the map, with the actions for it. Everything here is reachable by tap. */
function Detail({ meta }: { meta: Meta }) {
  const { state, selection, select, setRoadOpen, setBrigadeStatus, can } = useOperator();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  if (!selection) return null;

  const header = (icon: Parameters<typeof Icon>[0]["name"], title: string) => (
    <View style={styles.detailHeader}>
      <Icon name={icon} />
      <Text style={[type.heading, styles.detailTitle]}>{title}</Text>
      <IconButton icon="close" label={t("app.close")} onPress={() => select(null)} />
    </View>
  );

  if (selection.kind === "road") {
    const edge = state.roads.edges.find((e) => e.id === selection.id);
    if (!edge) return null;
    const toggle = async () => {
      setBusy(true);
      await setRoadOpen(edge.id, !edge.is_open);
      setBusy(false);
    };
    return (
      <>
        {header("road", roadName(edge.id, edge.name))}
        <View style={styles.badges}>
          <Badge tone={edge.is_open ? "ok" : "danger"} solid={!edge.is_open}>{t(edge.is_open ? "road.open" : "road.closed")}</Badge>
          {!edge.is_accessible && <Badge tone="warn" icon="accessible">{t("operator.barrier")}</Badge>}
        </View>
        <Fact label={t("road.length")}>{formatDistance(edge.length_m)}</Fact>
        {/* Closing a road goes through the simulator API, which only the admin role may use. */}
        {meta.sim_enabled && can("simulate") && (
          <Button variant={edge.is_open ? "danger" : "primary"} icon={edge.is_open ? "close" : "check"} block busy={busy} onPress={() => void toggle()}>
            {t(edge.is_open ? "road.close" : "road.reopen")}
          </Button>
        )}
      </>
    );
  }

  if (selection.kind === "sos") {
    const sos = state.sos.find((s) => s.id === selection.id);
    if (!sos) return null;
    const priority = sos.priority === CRITICAL_PRIORITY;
    return (
      <>
        {header(priority ? "accessible" : hazardIcon(sos.hazard_type), `SOS №${sos.id}`)}
        {priority && (
          <View style={styles.badges}><Badge tone="priority" solid icon="accessible">{t("operator.prioritySos")}</Badge></View>
        )}
        <View style={styles.facts}>
          <Fact label={t("sosQueue.hazard")}>{hazardLabel(sos.hazard_type)}</Fact>
          <Fact label={t("sim.zone")}>{zoneNameOf(state.zones, sos.zone_id)}</Fact>
          <Fact label={t("sosQueue.received")}>{formatTime(sos.created_at)}</Fact>
        </View>
        {priority && <Text style={[type.small, muted]}>{t("operator.priorityCitizen")}</Text>}
      </>
    );
  }

  if (selection.kind === "point") {
    const point = state.points.find((p) => p.id === selection.id);
    if (!point) return null;
    const level = occupancyLevel(point.occupancy_pct, meta.thresholds);
    return (
      <>
        {header(kindIcon(point.kind), pointName(point.name))}
        <View style={styles.badges}>
          <Badge>{t(`kind.${point.kind}`)}</Badge>
          {point.is_reserve && <Badge>{t("operator.reserve")}</Badge>}
          {!point.is_active && <Badge tone="warn">{t("operator.inactive")}</Badge>}
          {point.is_accessible && <Badge tone="priority" icon="accessible">{t("operator.accessible")}</Badge>}
        </View>
        {point.is_active && (
          <Meter
            pct={point.occupancy_pct}
            level={level}
            label={t("sim.occupancy")}
            valueText={occupancyText(point.occupancy_pct, level)}
            marks={[meta.thresholds.reroute_occupancy_pct, meta.thresholds.critical_occupancy_pct]}
            size="lg"
          />
        )}
        <View style={styles.facts}>
          {point.is_active && <Fact label={t("resources.inside")}>{formatNumber(point.occupancy)}</Fact>}
          <Fact label={t("resources.capacity")}>{formatNumber(point.capacity)}</Fact>
        </View>
      </>
    );
  }

  const brigade = state.brigades.find((b) => b.id === selection.id);
  if (!brigade) return null;
  return (
    <>
      {header("truck", brigadeName(brigade.name))}
      <View style={styles.facts}>
        <Fact label={t("resources.status")}>{t(`brigadeStatus.${brigade.status}`)}</Fact>
        {brigade.status === "en_route" && brigade.eta_s !== null ? <Fact label={t("resources.eta")}>{formatEta(brigade.eta_s)}</Fact> : null}
      </View>
      {brigade.target_alert_id ? (
        <Button variant="quiet" icon="bell" onPress={() => router.navigate(`/operator/alerts/${brigade.target_alert_id}` as Href)}>
          {t("operator.target", { id: brigade.target_alert_id })}
        </Button>
      ) : null}
      {can("decide") && (
        <Button icon="truck" block onPress={() => setPicking(true)}>{t("resources.status")}</Button>
      )}
      <ModalSheet open={picking} onClose={() => setPicking(false)} title={brigadeName(brigade.name)} closeLabel={t("app.close")}>
        <List label={t("resources.status")}>
          {BRIGADE_STATUSES.map((status) => (
            <ListRow
              key={status}
              title={t(`brigadeStatus.${status}`)}
              selected={status === brigade.status}
              onPress={() => {
                setPicking(false);
                void setBrigadeStatus(brigade.id, status);
              }}
            />
          ))}
        </List>
      </ModalSheet>
    </>
  );
}

/** Live map: SOS by hazard, Priority #1, district counts, points, brigades with routes, closed roads. */
export function LiveScreen() {
  const session = useOperator();
  const { state, selection, select, focus } = session;
  const meta = session.meta!;

  const closed = useMemo(() => closedRoads(state.roads.edges), [state.roads]);
  const scene = useMemo(() => operatorScene(state, meta, closed, selection, focus), [state, meta, closed, selection, focus]);

  const priority = state.sos.filter((s) => s.priority === CRITICAL_PRIORITY).length;
  const stats: [string, number, string][] = [
    ["operator.stats.openSos", state.sos.length, color.ink],
    ["operator.stats.prioritySos", priority, priority ? color.priorityText : color.ink],
    ["operator.stats.alerts", state.alerts.length, state.alerts.length ? color.dangerText : color.ink],
    ["operator.stats.closedRoads", closed.length, color.ink],
    ["operator.stats.brigadesFree", state.brigades.filter((b) => b.status === "available").length, color.ink],
    ["operator.stats.safe", state.safeCitizens, color.ink],
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.strip}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {stats.map(([key, value, tone]) => (
            <View key={key} style={styles.stat} accessible accessibilityLabel={`${t(key)}: ${value}`}>
              <Text style={[type.heading, { color: tone }]}>{value}</Text>
              <Text style={[type.label, muted]}>{t(key)}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
      <View style={styles.map}>
        <MapView
          scene={scene}
          center={meta.map.center}
          zoom={meta.map.zoom}
          label={t("operator.mapLabel")}
          onPress={(lat, lng, toleranceM) => {
            // Roads are selected by tapping near them, not exactly on a thin line.
            const edge = nearestEdge(state.roads.edges, lat, lng, toleranceM);
            select(edge ? { kind: "road", id: edge.id } : null);
          }}
          onSelect={select}
        />
        {selection ? (
          <DockedSheet label={t("operator.detailLabel")}>
            <View style={styles.detail}>
              <Detail meta={meta} />
            </View>
          </DockedSheet>
        ) : (
          <View style={styles.hint} pointerEvents="none">
            <Text style={[type.small, muted]}>{t("operator.mapHint")}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  strip: { borderBottomWidth: size.border, borderBottomColor: color.line },
  stat: { paddingVertical: space[2], paddingHorizontal: space[4], borderRightWidth: size.border, borderRightColor: color.line },
  map: { flex: 1 },
  hint: {
    position: "absolute",
    left: space[3],
    right: space[3],
    bottom: space[3],
    padding: space[3],
    borderRadius: space[3],
    backgroundColor: color.bg,
  },
  detail: { gap: space[3] },
  detailHeader: { flexDirection: "row", alignItems: "center", gap: space[2] },
  detailTitle: { flex: 1 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: space[4] },
  fact: { gap: space[1] },
});

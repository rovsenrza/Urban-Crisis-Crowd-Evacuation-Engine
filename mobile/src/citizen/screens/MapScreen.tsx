import { router } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { muted, space, type } from "../../design/theme";
import { color } from "../../design/tokens";
import { t } from "../../i18n";
import { haversineM } from "../../lib/format";
import { pointName } from "../../lib/labels";
import { MapView } from "../../map/MapView";
import type { MapTarget, SceneRoad } from "../../map/scene";
import type { Position } from "../../platform";
import { Badge, Banner, Button, DockedSheet, IconButton, Meter, Skeleton } from "../../ui";
import { occupancyText, routeSummary } from "../labels";
import { LocationSheet } from "../LocationSheet";
import { citizenRoads, citizenScene } from "../scene";
import { useCitizen } from "../session";
import { useLocate } from "../useLocate";

/** Streets with barriers are only drawn near the citizen: a native map slows down with over a thousand overlays. */
const BARRIER_RADIUS_M = 2_500;

function nearby(roads: SceneRoad[], origin: { lat: number; lng: number } | undefined): SceneRoad[] {
  return roads.filter(
    (road) =>
      road.style === "closedRoad" ||
      (origin !== undefined && haversineM(origin.lat, origin.lng, road.path[0][0], road.path[0][1]) < BARRIER_RADIUS_M),
  );
}

/** Map tab: know where to go. Full-bleed map, the current route in a sheet at thumb height. */
export function MapScreen() {
  const session = useCitizen();
  const { plan, selected, planning, safe, priority } = session;
  const [pending, setPending] = useState<Position | null>(null);
  const [choosing, setChoosing] = useState(false);
  const { locate, locating, errorText } = useLocate();

  const origin = plan?.origin;
  const roads = useMemo(
    () => nearby(citizenRoads(session.roads, priority), origin),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session.roads, priority, origin?.lat, origin?.lng],
  );
  const scene = useMemo(
    () => citizenScene({ plan, roads: session.roads, showBarriers: priority, pending, routeVersion: session.routeVersion }, roads),
    [plan, session.roads, priority, pending, session.routeVersion, roads],
  );

  const onSelect = (target: MapTarget) => {
    if (target.kind === "point") router.push(`/points/${target.id}`);
  };

  const confirmPending = async () => {
    if (!pending) return;
    const position = pending;
    setPending(null);
    await session.setPosition(position);
  };

  let sheet;
  if (pending) {
    sheet = (
      <>
        <Text style={type.heading}>{t("citizen.map.pendingTitle")}</Text>
        <Text style={[type.body, muted]}>{t("citizen.map.pendingText")}</Text>
        <View style={styles.actions}>
          <Button variant="primary" size="lg" icon="pin" block onPress={() => void confirmPending()}>{t("citizen.map.pendingConfirm")}</Button>
          <Button size="lg" block onPress={() => setPending(null)}>{t("app.cancel")}</Button>
        </View>
      </>
    );
  } else if (planning) {
    sheet = (
      <>
        <Text style={type.heading}>{t("citizen.map.planning")}</Text>
        <Skeleton lines={3} label={t("citizen.map.planning")} />
      </>
    );
  } else if (safe) {
    sheet = (
      <>
        <View style={styles.badges}><Badge tone="ok" icon="check">{t("citizen.safeBadge")}</Badge></View>
        <Text style={type.heading}>{t("citizen.safeTitle")}</Text>
        <Text style={[type.body, muted]}>{t("citizen.safeDetail")}</Text>
        <View style={styles.actions}>
          <Button variant="primary" size="lg" icon="route" block onPress={() => { session.clearSafe(); setChoosing(true); }}>
            {t("citizen.planAgain")}
          </Button>
          <Button size="lg" icon="sos" block onPress={() => { session.clearSafe(); router.navigate("/sos"); }}>
            {t("citizen.needHelpAgain")}
          </Button>
        </View>
      </>
    );
  } else if (!plan) {
    sheet = (
      <>
        <Text style={type.heading}>{t("citizen.whereAreYou")}</Text>
        <Text style={[type.body, muted]}>{t("citizen.map.startText")}</Text>
        {errorText && <Banner tone="danger">{errorText}</Banner>}
        <View style={styles.actions}>
          <Button variant="primary" size="lg" icon="locate" block busy={locating} onPress={() => void locate()}>
            {t(locating ? "citizen.locating" : "citizen.shareLocation")}
          </Button>
          <Button size="lg" icon="pin" block onPress={() => setChoosing(true)}>{t("citizen.chooseDistrict")}</Button>
        </View>
      </>
    );
  } else if (!plan.reachable || !selected) {
    sheet = (
      <>
        <Text style={type.heading}>{t(plan.accessible ? "citizen.noAccessibleRoute" : "citizen.noRoute")}</Text>
        <Text style={[type.body, muted]}>{t(plan.accessible ? "citizen.noAccessibleRouteHelp" : "citizen.noRouteHelp")}</Text>
        <View style={styles.actions}>
          <Button variant="danger" size="lg" icon="sos" block onPress={() => router.navigate("/sos")}>{t("citizen.sendSos")}</Button>
          <Button size="lg" icon="pin" block onPress={() => setChoosing(true)}>{t("citizen.changePosition")}</Button>
        </View>
      </>
    );
  } else {
    const isRecommended = selected.point.id === plan.recommended_point_id;
    sheet = (
      <>
        {(plan.accessible || isRecommended || plan.routing_mode === "fallback") && (
          <View style={styles.badges}>
            {plan.accessible && <Badge tone="priority" icon="accessible">{t("citizen.accessibleRoute")}</Badge>}
            {isRecommended && <Badge tone="accent">{t("citizen.recommended")}</Badge>}
            {plan.routing_mode === "fallback" && <Badge tone="warn" icon="offline">{t("routing.badge")}</Badge>}
          </View>
        )}
        <View>
          <Text style={[type.smallMedium, muted]}>{t("citizen.map.routeTo")}</Text>
          <Text style={type.title}>{pointName(selected.point.name)}</Text>
          <Text style={[type.bodyLarge, styles.summary]}>{routeSummary(selected)}</Text>
        </View>
        <Meter
          pct={selected.point.occupancy_pct}
          level={selected.level}
          label={t("citizen.occupancy")}
          valueText={occupancyText(selected.point.occupancy_pct, selected.level)}
          size="lg"
        />
        {plan.all_full && <Text style={[type.smallMedium, { color: color.warnText }]}>{t("citizen.allFull")}</Text>}
        {/* Stacked, like every other sheet state: side by side, long Azerbaijani labels break mid-word. */}
        <View style={styles.actions}>
          <Button variant="primary" icon="list" block onPress={() => router.navigate("/points")}>{t("citizen.map.otherPoints")}</Button>
          <Button icon="check" block busy={session.safeBusy} onPress={() => void session.markSafe()}>{t("citizen.imSafe")}</Button>
        </View>
        <Text style={[type.small, muted]}>{t("citizen.mapHint")}</Text>
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <MapView
        scene={scene}
        center={session.center}
        zoom={session.zoom}
        label={t("citizen.map.label")}
        sheetInset
        onPress={(lat, lng) => setPending({ lat, lng })}
        onSelect={onSelect}
      />
      <View style={styles.tools}>
        <IconButton variant="raised" icon="locate" label={t("citizen.shareLocation")} disabled={locating} onPress={() => void locate()} />
      </View>
      <DockedSheet label={t("citizen.map.sheetLabel")}>
        <View style={styles.stack}>{sheet}</View>
      </DockedSheet>
      <LocationSheet open={choosing} onClose={() => setChoosing(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tools: { position: "absolute", top: space[3], right: space[3] },
  stack: { gap: space[3] },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  summary: { marginTop: space[1] },
  actions: { gap: space[2] },
});

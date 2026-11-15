import { router, useLocalSearchParams, type Href } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { color, muted, radius, size, space, type } from "../../design/theme";
import { t } from "../../i18n";
import { formatDistance, formatEta, formatNumber } from "../../lib/format";
import { pointName } from "../../lib/labels";
import { TopBar } from "../../shell/parts";
import { Badge, Banner, Button, EmptyState, Icon, kindIcon, List, ListRow, Meter, SkeletonList } from "../../ui";
import { occupancyText, routeSummary } from "../labels";
import { LocationSheet } from "../LocationSheet";
import { useCitizen } from "../session";

/** `/points`: compare alternatives. Nearest active points, ranked by route distance. */
export function PointsScreen() {
  const { plan, planning } = useCitizen();
  const [choosing, setChoosing] = useState(false);
  const title = t(plan?.accessible ? "citizen.accessiblePoints" : "citizen.nearestPoints");

  let body;
  if (planning && !plan) {
    body = <SkeletonList rows={5} label={t("app.loading")} />;
  } else if (!plan) {
    body = (
      <EmptyState
        icon="pin"
        title={t("points.emptyTitle")}
        action={
          <Button variant="primary" size="lg" icon="locate" onPress={() => setChoosing(true)}>
            {t("points.setPosition")}
          </Button>
        }
      >
        {t("points.emptyText")}
      </EmptyState>
    );
  } else if (!plan.reachable || plan.options.length === 0) {
    body = (
      <EmptyState
        icon="alert"
        title={t(plan.accessible ? "citizen.noAccessibleRoute" : "citizen.noRoute")}
        action={
          <Button variant="danger" size="lg" icon="sos" onPress={() => router.navigate("/sos")}>
            {t("citizen.sendSos")}
          </Button>
        }
      >
        {t(plan.accessible ? "citizen.noAccessibleRouteHelp" : "citizen.noRouteHelp")}
      </EmptyState>
    );
  } else {
    body = (
      <>
        {plan.all_full && <Banner tone="warn">{t("citizen.allFull")}</Banner>}
        <View style={styles.bleed}>
          <List label={title}>
            {plan.options.map((option) => {
              const isSelected = option.point.id === plan.selected_point_id;
              const isRecommended = option.point.id === plan.recommended_point_id;
              return (
                <ListRow
                  key={option.point.id}
                  icon={kindIcon(option.point.kind)}
                  title={pointName(option.point.name)}
                  subtitle={`${t(`kind.${option.point.kind}`)} · ${routeSummary(option)}`}
                  selected={isSelected}
                  chevron
                  onPress={() => router.push(`/points/${option.point.id}` as Href)}
                >
                  <Meter
                    pct={option.point.occupancy_pct}
                    level={option.level}
                    label={t("citizen.occupancy")}
                    valueText={occupancyText(option.point.occupancy_pct, option.level)}
                  />
                  {(isSelected || isRecommended) && (
                    <View style={styles.badges}>
                      {isSelected && <Badge tone="accent" solid icon="route">{t("citizen.selected")}</Badge>}
                      {isRecommended && <Badge tone="accent">{t("citizen.recommended")}</Badge>}
                    </View>
                  )}
                </ListRow>
              );
            })}
          </List>
        </View>
        <Button variant="quiet" icon="pin" onPress={() => setChoosing(true)}>{t("citizen.changePosition")}</Button>
      </>
    );
  }

  return (
    <View style={styles.screen}>
      <TopBar title={title} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>{body}</ScrollView>
      <LocationSheet open={choosing} onClose={() => setChoosing(false)} />
    </View>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fact}>
      <Text style={[type.small, muted]}>{label}</Text>
      {children}
    </View>
  );
}

/** `/points/:id`: decide. Everything about one point, and "Go here" at thumb height. */
export function PointDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { plan, planning, selectPoint } = useCitizen();
  const option = plan?.options.find((o) => String(o.point.id) === id);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/points"));

  if (!option || !plan) {
    return (
      <View style={styles.screen}>
        <TopBar title={t("points.detailTitle")} onBack={back} />
        <EmptyState
          icon="pin"
          title={t("points.missingTitle")}
          action={
            <Button variant="primary" icon="list" onPress={() => router.replace("/points")}>
              {t("points.backToList")}
            </Button>
          }
        >
          {t("points.missingText")}
        </EmptyState>
      </View>
    );
  }

  const { point } = option;
  const isSelected = point.id === plan.selected_point_id;
  const go = async () => {
    if (isSelected || (await selectPoint(point.id))) router.navigate("/map");
  };

  return (
    <View style={styles.screen}>
      <TopBar title={t("points.detailTitle")} onBack={back} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <View style={styles.head}>
          <View style={styles.headIcon}>
            <Icon name={kindIcon(point.kind)} size="lg" />
          </View>
          <View style={styles.headText}>
            <Text style={type.title} accessibilityRole="header">{pointName(point.name)}</Text>
            <Text style={[type.body, muted]}>{t(`kind.${point.kind}`)}</Text>
          </View>
        </View>
        <View style={styles.badges}>
          {isSelected && <Badge tone="accent" solid icon="route">{t("citizen.selected")}</Badge>}
          {point.id === plan.recommended_point_id && <Badge tone="accent">{t("citizen.recommended")}</Badge>}
          {point.is_accessible && <Badge tone="priority" icon="accessible">{t("citizen.accessibleEntrance")}</Badge>}
          {plan.routing_mode === "fallback" && <Badge tone="warn" icon="offline">{t("routing.badge")}</Badge>}
        </View>

        <View style={styles.factRow}>
          <Fact label={t("points.distance")}>
            <Text style={type.bodyLarge}>{formatDistance(option.distance_m)}</Text>
          </Fact>
          <Fact label={t("points.eta")}>
            <Text style={type.bodyLarge}>{formatEta(option.eta_s)}</Text>
          </Fact>
        </View>
        <Fact label={t("citizen.occupancy")}>
          <Meter
            pct={point.occupancy_pct}
            level={option.level}
            label={t("citizen.occupancy")}
            valueText={occupancyText(point.occupancy_pct, option.level)}
            size="lg"
          />
          <Text style={[type.small, muted]}>
            {t("points.people", { occupancy: formatNumber(point.occupancy), capacity: formatNumber(point.capacity) })}
          </Text>
        </Fact>
        <Fact label={t("points.entrance")}>
          <Text style={type.bodyLarge}>
            {t(point.is_accessible ? "citizen.accessibleEntrance" : "points.entranceUnknown")}
          </Text>
        </Fact>
      </ScrollView>
      <View style={styles.footer}>
        <Button variant="primary" size="lg" icon={isSelected ? "map" : "route"} block busy={planning} onPress={() => void go()}>
          {t(isSelected ? "points.showRoute" : "citizen.goHere")}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  scroll: { flex: 1 },
  body: { padding: space[4], gap: space[4] },
  bleed: { marginHorizontal: -space[4] },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  head: { flexDirection: "row", alignItems: "center", gap: space[3] },
  headIcon: {
    width: size.controlLg,
    height: size.controlLg,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  headText: { flex: 1 },
  factRow: { flexDirection: "row", gap: space[4] },
  fact: { flex: 1, gap: space[1] },
  footer: { padding: space[4], borderTopWidth: size.border, borderTopColor: color.line, backgroundColor: color.bg },
});

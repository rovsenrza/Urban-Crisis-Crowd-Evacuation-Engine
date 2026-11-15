import { router, type Href } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { Brigade, BrigadeStatus } from "../../api/types";
import { occupancyText } from "../../citizen/labels";
import { color, muted, radius, size, space, type } from "../../design/theme";
import { t } from "../../i18n";
import { formatEta, formatNumber, occupancyLevel } from "../../lib/format";
import { brigadeName, pointName } from "../../lib/labels";
import { TopBar } from "../../shell/parts";
import { Badge, Button, IconButton, kindIcon, List, ListRow, Meter, ModalSheet, SegmentedControl } from "../../ui";
import { useOperator } from "../session";

const BRIGADE_STATUSES: BrigadeStatus[] = ["available", "en_route", "on_site", "returning"];
const LIVE = "/operator/live" as Href;

type Tab = "points" | "brigades";

/** Assembly points with occupancy, and brigades with their status. One list at a time on a phone. */
export function ResourcesScreen() {
  const { state, meta, can, setBrigadeStatus, showOnMap } = useOperator();
  const [tab, setTab] = useState<Tab>("points");
  // The brigade whose status is being changed (the picker sheet is open for it).
  const [picking, setPicking] = useState<Brigade | null>(null);
  const [saving, setSaving] = useState(false);

  const thresholds = meta?.thresholds;
  const marks = thresholds ? [thresholds.reroute_occupancy_pct, thresholds.critical_occupancy_pct] : [];
  const points = [...state.points].sort((a, b) => Number(b.is_active) - Number(a.is_active) || b.occupancy_pct - a.occupancy_pct);
  const mayDecide = can("decide");

  const choose = async (status: BrigadeStatus) => {
    if (!picking || saving) return;
    if (status === picking.status) return setPicking(null);
    setSaving(true);
    await setBrigadeStatus(picking.id, status);
    setSaving(false);
    setPicking(null);
  };

  return (
    <View style={styles.screen}>
      <TopBar title={t("nav.resources")} />
      <ScrollView contentContainerStyle={styles.body}>
        <SegmentedControl<Tab>
          label={t("nav.resources")}
          value={tab}
          onChange={setTab}
          options={[
            { value: "points", label: t("operator.assembly") },
            { value: "brigades", label: t("operator.brigades") },
          ]}
        />

        {tab === "points" ? (
          <>
            <View style={styles.card}>
              <List label={t("operator.assembly")}>
                {points.map((point) => {
                  const level = occupancyLevel(point.occupancy_pct, thresholds);
                  const tagged = point.is_accessible || point.is_reserve || !point.is_active;
                  return (
                    <ListRow
                      key={point.id}
                      icon={kindIcon(point.kind)}
                      title={pointName(point.name)}
                      subtitle={
                        point.is_active
                          ? `${t(`kind.${point.kind}`)} · ${formatNumber(point.occupancy)} / ${formatNumber(point.capacity)}`
                          : `${t(`kind.${point.kind}`)} · ${t("resources.capacity")} ${formatNumber(point.capacity)}`
                      }
                      chevron
                      onPress={() => {
                        showOnMap({ kind: "point", id: point.id }, [point.lat, point.lng]);
                        router.navigate(LIVE);
                      }}
                    >
                      {point.is_active && (
                        <Meter
                          pct={point.occupancy_pct}
                          level={level}
                          label={t("sim.occupancy")}
                          valueText={occupancyText(point.occupancy_pct, level)}
                          marks={marks}
                        />
                      )}
                      {tagged && (
                        <View style={styles.badges}>
                          {point.is_accessible && <Badge tone="priority" icon="accessible">{t("operator.accessible")}</Badge>}
                          {point.is_reserve && <Badge>{t("operator.reserve")}</Badge>}
                          {!point.is_active && <Badge tone="warn">{t("operator.inactive")}</Badge>}
                        </View>
                      )}
                    </ListRow>
                  );
                })}
              </List>
            </View>
            {marks.length === 2 && (
              <Text style={[type.small, muted]}>{t("resources.marksHint", { reroute: marks[0], critical: marks[1] })}</Text>
            )}
          </>
        ) : (
          <View style={styles.card}>
            <List label={t("operator.brigades")}>
              {state.brigades.map((brigade) => {
                const name = brigadeName(brigade.name);
                const status = t(`brigadeStatus.${brigade.status}`);
                const detail = [
                  brigade.target_alert_id ? t("operator.target", { id: brigade.target_alert_id }) : "",
                  brigade.status === "en_route" && brigade.eta_s !== null ? t("operator.eta", { value: formatEta(brigade.eta_s) }) : "",
                ].filter(Boolean).join(" · ");
                return (
                  <ListRow
                    key={brigade.id}
                    icon="truck"
                    title={name}
                    subtitle={detail || undefined}
                    trailing={
                      <IconButton
                        icon="map"
                        label={`${name}: ${t("operator.showOnMap")}`}
                        onPress={() => {
                          showOnMap({ kind: "brigade", id: brigade.id }, [brigade.lat, brigade.lng]);
                          router.navigate(LIVE);
                        }}
                      />
                    }
                  >
                    {/* Changing a status is a dispatcher action; observers see it as text. */}
                    {mayDecide ? (
                      <Button accessibilityLabel={`${name}: ${t("resources.status")}, ${status}`} onPress={() => setPicking(brigade)}>
                        {status}
                      </Button>
                    ) : (
                      <Text style={[type.smallMedium, muted]}>{`${t("resources.status")}: ${status}`}</Text>
                    )}
                  </ListRow>
                );
              })}
            </List>
          </View>
        )}
      </ScrollView>

      <ModalSheet
        open={picking !== null}
        onClose={() => setPicking(null)}
        title={picking ? `${brigadeName(picking.name)}: ${t("resources.status")}` : t("resources.status")}
        closeLabel={t("app.close")}
      >
        <List label={t("resources.status")}>
          {BRIGADE_STATUSES.map((status) => (
            <ListRow
              key={status}
              title={t(`brigadeStatus.${status}`)}
              icon={picking?.status === status ? "check" : undefined}
              tone="accent"
              selected={picking?.status === status}
              onPress={() => void choose(status)}
            />
          ))}
        </List>
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space[4], gap: space[4] },
  card: { borderWidth: size.border, borderColor: color.line, borderRadius: radius.md, overflow: "hidden", backgroundColor: color.bg },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});

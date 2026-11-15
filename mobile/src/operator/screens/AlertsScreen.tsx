import { router, useLocalSearchParams, type Href } from "expo-router";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { Alert } from "../../api/types";
import { color, muted, radius, size, space, type } from "../../design/theme";
import { t } from "../../i18n";
import { formatTime } from "../../lib/format";
import { TopBar } from "../../shell/parts";
import { Badge, Button, EmptyState, List, ListRow } from "../../ui";
import { AlertActions } from "../AlertActions";
import { decisionLines, describeAlert, hazardLabel, ruleLabel } from "../describe";
import { useOperator } from "../session";

function StatusBadge({ alert }: { alert: Alert }) {
  if (alert.status === "open") return <Badge tone="danger" solid icon="alert">{t("alert.status.open")}</Badge>;
  if (alert.status === "confirmed") return <Badge tone="ok" icon="check">{t("alert.status.confirmed")}</Badge>;
  return <Badge>{t("alert.status.dismissed")}</Badge>;
}

function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={type.heading} accessibilityRole="header">
        {title} <Text style={[type.heading, muted, styles.count]}>{count}</Text>
      </Text>
      {children}
    </View>
  );
}

/** Open and past alerts. */
export function AlertsScreen() {
  const { state, pastAlerts, meta } = useOperator();
  if (!meta) return null;

  const row = (alert: Alert) => (
    <ListRow
      key={alert.id}
      icon={alert.status === "open" ? "alert" : alert.status === "confirmed" ? "check" : "close"}
      tone={alert.status === "open" ? "danger" : "neutral"}
      title={`№${alert.id} · ${ruleLabel(alert)}`}
      subtitle={describeAlert(alert, state.zones, meta)}
      chevron
      onPress={() => router.push(`/operator/alerts/${alert.id}` as Href)}
    >
      <View style={styles.rowMeta}>
        <StatusBadge alert={alert} />
        <Text style={[type.small, muted]}>{formatTime(alert.created_at)}</Text>
      </View>
    </ListRow>
  );

  return (
    <View style={styles.screen}>
      <TopBar title={t("nav.alerts")} />
      <ScrollView contentContainerStyle={styles.body}>
        <Section title={t("alert.open")} count={state.alerts.length}>
          {state.alerts.length === 0 ? (
            <Text style={[type.body, muted, styles.quiet]}>{t("alert.none")}</Text>
          ) : (
            <View style={styles.card}><List label={t("alert.open")}>{state.alerts.map(row)}</List></View>
          )}
        </Section>
        <Section title={t("alert.past")} count={pastAlerts.length}>
          {pastAlerts.length === 0 ? (
            <Text style={[type.body, muted, styles.quiet]}>{t("alert.pastEmpty")}</Text>
          ) : (
            <View style={styles.card}><List label={t("alert.past")}>{pastAlerts.map(row)}</List></View>
          )}
        </Section>
      </ScrollView>
    </View>
  );
}

function Fact({ label, children }: { label: string; children: string }) {
  return (
    <View style={styles.fact}>
      <Text style={[type.small, muted]}>{label}</Text>
      <Text style={type.bodyMedium}>{children}</Text>
    </View>
  );
}

/** One alert: what happened, the decision, and what the decision did. */
export function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, pastAlerts, meta, showOnMap } = useOperator();
  const alert = [...state.alerts, ...pastAlerts].find((a) => String(a.id) === id);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/operator/alerts" as Href));

  if (!alert || !meta) {
    return (
      <View style={styles.screen}>
        <TopBar title={t("nav.alerts")} onBack={back} />
        <EmptyState
          icon="bell"
          title={t("alert.missingTitle")}
          action={<Button variant="primary" icon="list" onPress={() => router.replace("/operator/alerts" as Href)}>{t("alert.backToList")}</Button>}
        >
          {t("alert.missingText")}
        </EmptyState>
      </View>
    );
  }

  const hazards: string[] = alert.payload.hazard_types ?? [];
  return (
    <View style={styles.screen}>
      <TopBar title={`№${alert.id} · ${ruleLabel(alert)}`} onBack={back} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.badges}><StatusBadge alert={alert} /></View>
        <Text style={type.bodyLarge}>{describeAlert(alert, state.zones, meta)}</Text>

        <View style={styles.facts}>
          <Fact label={t("alert.raised")}>{formatTime(alert.created_at)}</Fact>
          {hazards.length > 0 ? <Fact label={t("alert.hazardTypes")}>{hazards.map((h) => hazardLabel(h)).join(", ")}</Fact> : null}
          {alert.resolved_at ? (
            <Fact label={t(alert.status === "confirmed" ? "alert.confirmedAt" : "alert.dismissedAt")}>
              {`${formatTime(alert.resolved_at)}${alert.resolved_by ? ` · ${alert.resolved_by}` : ""}`}
            </Fact>
          ) : null}
          {alert.dismiss_reason ? <Fact label={t("alert.dismissReason")}>{alert.dismiss_reason}</Fact> : null}
        </View>

        {alert.status === "open" ? (
          <>
            <Text style={[type.body, styles.plan]}>{t("alert.action")}</Text>
            {/* Keyed by alert: a half-typed dismissal never carries over to another alert. */}
            <AlertActions key={alert.id} alert={alert} />
          </>
        ) : null}

        {alert.status === "confirmed" ? (
          <View style={styles.section}>
            <Text style={type.subheading} accessibilityRole="header">{t("alert.executed")}</Text>
            {decisionLines(alert.actions).map((line) => (
              <View key={line} style={styles.bullet}>
                <View style={styles.dot} />
                <Text style={[type.body, styles.bulletText]}>{line}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Button
          icon="map"
          block
          onPress={() => {
            showOnMap(null, [alert.lat, alert.lng]);
            router.navigate("/operator/live" as Href);
          }}
        >
          {t("operator.showOnMap")}
        </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  body: { padding: space[4], gap: space[4] },
  section: { gap: space[2] },
  count: { fontFamily: type.body.fontFamily },
  quiet: { padding: space[4], borderRadius: radius.md, backgroundColor: color.surface },
  card: { borderWidth: size.border, borderColor: color.line, borderRadius: radius.md, overflow: "hidden" },
  rowMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space[2] },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  facts: { flexDirection: "row", flexWrap: "wrap", rowGap: space[4], columnGap: space[4] },
  fact: { minWidth: "44%", flexGrow: 1, gap: space[1] },
  plan: { padding: space[3], borderRadius: radius.sm, backgroundColor: color.accentSoft },
  bullet: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  dot: { width: space[1], height: space[1], marginTop: space[2], borderRadius: radius.full, backgroundColor: color.ink },
  bulletText: { flex: 1 },
});

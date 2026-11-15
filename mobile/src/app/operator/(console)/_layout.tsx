import { Redirect, Stack, router, usePathname, type Href } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CRITICAL_PRIORITY } from "../../../api/types";
import { color, radius, size, space, type } from "../../../design/theme";
import { t } from "../../../i18n";
import { errorText } from "../../../lib/labels";
import { describeAlert, ruleLabel } from "../../../operator/describe";
import { useOperator } from "../../../operator/session";
import { Launch, Mark } from "../../../shell/Launch";
import { Banner, Button, ErrorState, Icon, IconButton, type IconName } from "../../../ui";

interface Tab {
  path: Href;
  match: string;
  labelKey: string;
  icon: IconName;
  count?: number;
  tone?: "danger" | "priority" | "neutral";
}

function TabBar({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom }]} accessibilityRole="tablist" accessibilityLabel={t("nav.label")}>
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.match);
        const badge = tab.tone === "danger" ? color.danger : tab.tone === "priority" ? color.priority : color.ink;
        return (
          <Pressable
            key={tab.match}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.count ? `${t(tab.labelKey)}: ${tab.count}` : t(tab.labelKey)}
            onPress={() => router.navigate(tab.path)}
          >
            <View style={[styles.tabIndicator, active && styles.tabIndicatorActive]} />
            <View>
              <Icon name={tab.icon} color={active ? color.ink : color.inkMuted} />
              {Boolean(tab.count) && (
                <View style={[styles.count, { backgroundColor: badge }]}>
                  <Text style={[type.label, styles.countText]}>{tab.count}</Text>
                </View>
              )}
            </View>
            <Text style={[type.label, active ? styles.tabLabelActive : styles.tabLabel]} numberOfLines={1}>{t(tab.labelKey)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The dispatcher console: who is signed in, the pinned RED alert, the screen, and four destinations. */
export default function ConsoleLayout() {
  const session = useOperator();
  const insets = useSafeAreaInsets();

  if (!session.token) return <Redirect href="/operator/login" />;
  if (session.status === "error") {
    return (
      <View style={styles.center}>
        <ErrorState title={t("errors.loadTitle")} retryLabel={t("app.retry")} onRetry={session.retry}>
          {errorText(session.error)}
        </ErrorState>
        <Button variant="quiet" icon="signOut" onPress={session.logout}>{t("operator.logout")}</Button>
      </View>
    );
  }
  if (session.status !== "ready" || !session.meta) return <Launch label={t("app.loading")} />;

  const { state, meta } = session;
  const [current, ...waiting] = state.alerts;
  const priority = state.sos.filter((s) => s.priority === CRITICAL_PRIORITY).length;
  const tabs: Tab[] = [
    { path: "/operator/live", match: "/operator/live", labelKey: "nav.live", icon: "map" },
    { path: "/operator/alerts", match: "/operator/alerts", labelKey: "nav.alerts", icon: "bell", count: state.alerts.length, tone: "danger" },
    { path: "/operator/sos", match: "/operator/sos", labelKey: "nav.sos", icon: "sos", count: state.sos.length, tone: priority ? "priority" : "neutral" },
    { path: "/operator/resources", match: "/operator/resources", labelKey: "nav.resources", icon: "truck" },
  ];

  return (
    <View style={[styles.console, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <IconButton icon="chevronLeft" label={t("operator.backToCitizen")} onPress={() => router.replace("/settings")} />
        <Mark />
        <View style={styles.identity}>
          <Text style={type.subheading} numberOfLines={1}>{t("operator.console")}</Text>
          <Text style={[type.label, styles.muted]} numberOfLines={1}>
            {session.operator} · {t(`role.${session.role}`)} · {t(session.connected ? "app.online" : "app.offline")}
          </Text>
        </View>
        <IconButton icon="signOut" label={t("operator.logout")} onPress={session.logout} />
      </View>

      {/* The open RED alert stays on every console screen: the one thing a dispatcher must never miss. */}
      {current && (
        <Pressable
          style={styles.pinned}
          accessibilityRole="button"
          accessibilityLabel={`${t("alert.red")} №${current.id}. ${t("alert.details")}`}
          onPress={() => router.navigate(`/operator/alerts/${current.id}` as Href)}
        >
          <Icon name="alert" color={color.onDanger} />
          <View style={styles.pinnedText}>
            <Text style={[type.subheading, styles.onDanger]}>
              {t("alert.red")} №{current.id} · {ruleLabel(current)}
              {waiting.length > 0 ? `  (${t("alert.more", { count: waiting.length })})` : ""}
            </Text>
            <Text style={[type.small, styles.onDanger]} numberOfLines={2}>{describeAlert(current, state.zones, meta)}</Text>
          </View>
          <Icon name="chevronRight" color={color.onDanger} />
        </Pressable>
      )}

      <View style={styles.main}>
        <Stack screenOptions={{ headerShown: false, animation: "none", contentStyle: { backgroundColor: color.bg } }} />
        {session.toast && (
          <View style={styles.toast}>
            <Banner
              tone={session.toast.tone === "ok" ? "ok" : "danger"}
              onDismiss={session.dismissToast}
              dismissLabel={t("app.close")}
            >
              {session.toast.render()}
            </Banner>
          </View>
        )}
      </View>
      <TabBar tabs={tabs} />
    </View>
  );
}

const styles = StyleSheet.create({
  console: { flex: 1, backgroundColor: color.bg },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: space[3], backgroundColor: color.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    minHeight: size.topBar,
    paddingHorizontal: space[4],
    borderBottomWidth: size.border,
    borderBottomColor: color.line,
  },
  identity: { flex: 1 },
  muted: { color: color.inkMuted },
  pinned: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    minHeight: size.controlLg,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    backgroundColor: color.danger,
  },
  pinnedText: { flex: 1, gap: space[1] },
  onDanger: { color: color.onDanger },
  main: { flex: 1 },
  toast: { position: "absolute", left: space[3], right: space[3], bottom: space[3] },
  tabBar: { flexDirection: "row", borderTopWidth: size.border, borderTopColor: color.line, backgroundColor: color.bg },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: space[1], minHeight: size.tabBar, paddingBottom: space[1] },
  tabIndicator: { position: "absolute", top: 0, left: space[4], right: space[4], height: size.focusRing, borderBottomLeftRadius: radius.sm, borderBottomRightRadius: radius.sm },
  tabIndicatorActive: { backgroundColor: color.accent },
  tabLabel: { color: color.inkMuted },
  tabLabelActive: { color: color.ink, fontFamily: type.subheading.fontFamily },
  count: {
    position: "absolute",
    top: -space[2],
    left: size.icon - space[1],
    minWidth: space[5],
    height: space[5],
    paddingHorizontal: space[1],
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  countText: { color: color.inkInverse, fontFamily: type.subheading.fontFamily },
});

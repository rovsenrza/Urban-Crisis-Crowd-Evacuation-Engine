import { Redirect, Stack, router, usePathname } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CRITICAL_PRIORITY } from "../../api/types";
import { bannerContent } from "../../citizen/banner";
import { useCitizen } from "../../citizen/session";
import { color, radius, size, space, type } from "../../design/theme";
import { t } from "../../i18n";
import { errorText } from "../../lib/labels";
import { Launch } from "../../shell/Launch";
import { Banner, ErrorState, Icon, type IconName } from "../../ui";

const TABS: { path: "/map" | "/points" | "/settings"; labelKey: string; icon: IconName }[] = [
  { path: "/map", labelKey: "tabs.map", icon: "map" },
  { path: "/points", labelKey: "tabs.points", icon: "list" },
  { path: "/settings", labelKey: "tabs.settings", icon: "settings" },
];

/** Three destinations plus the persistent SOS action, which is an action and not a tab. */
function TabBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { sos, pendingSos } = useCitizen();
  const sent = Boolean(sos);
  const sosLabel = sent
    ? t(sos?.priority === CRITICAL_PRIORITY ? "citizen.sosPrioritySent" : "citizen.sosSent")
    : pendingSos
      ? t("sos.pendingShort")
      : t("citizen.sosHint");

  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom }]} accessibilityRole="tablist" accessibilityLabel={t("tabs.label")}>
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.path);
        return (
          <Pressable
            key={tab.path}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t(tab.labelKey)}
            onPress={() => router.navigate(tab.path)}
          >
            {/* The current tab is marked by a bar and bolder text, not by colour alone. */}
            <View style={[styles.tabIndicator, active && styles.tabIndicatorActive]} />
            <Icon name={tab.icon} color={active ? color.ink : color.inkMuted} />
            <Text style={[type.label, active ? styles.tabLabelActive : styles.tabLabel]} numberOfLines={1}>
              {t(tab.labelKey)}
            </Text>
          </Pressable>
        );
      })}
      <View style={styles.sosCell}>
        <Pressable
          style={({ pressed }) => [styles.sos, sent && styles.sosSent, pressed && (sent ? styles.sosSentPressed : styles.sosPressed)]}
          accessibilityRole="button"
          accessibilityLabel={`${t("citizen.sos")}: ${sosLabel}`}
          onPress={() => router.navigate("/sos")}
        >
          <Icon name={sent ? "check" : "sos"} color={sent ? color.dangerText : color.onDanger} />
          <Text style={[type.heading, { color: sent ? color.dangerText : color.onDanger }]}>{t("citizen.sos")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** The app shell: notices on top, the current screen, the tab bar and the SOS action. */
export default function AppLayout() {
  const session = useCitizen();
  const insets = useSafeAreaInsets();

  if (!session.onboarded) return <Redirect href="/welcome" />;
  if (session.boot === "loading") return <Launch label={t("app.loading")} />;
  if (session.boot === "error") {
    return (
      <View style={styles.center}>
        <ErrorState title={t("errors.loadTitle")} retryLabel={t("app.retry")} onRetry={session.retryBoot}>
          {errorText(session.bootError)}
        </ErrorState>
      </View>
    );
  }

  const banner = session.banner ? bannerContent(session.banner) : null;
  const fallback = session.plan?.routing_mode === "fallback";
  const notices = fallback || !session.connected || banner;

  return (
    <View style={[styles.app, { paddingTop: insets.top }]}>
      {notices && (
        <View style={styles.notices}>
          {/* The external routing API is down: routes come from local data. Stays until it recovers. */}
          {fallback && (
            <Banner tone="warn" icon="offline" title={t("routing.fallbackTitle")}>
              {t(`routing.fallback.${session.plan?.fallback_source ?? "local_graph"}`)}
            </Banner>
          )}
          {!session.connected && (
            <Banner tone="warn" icon="offline">{t("app.reconnecting")}</Banner>
          )}
          {banner && session.banner && (
            <Banner
              tone={session.banner.tone}
              icon={session.banner.kind === "error" ? "alert" : "route"}
              title={banner.title}
              onDismiss={session.dismissBanner}
              dismissLabel={t("app.close")}
            >
              {banner.text}
            </Banner>
          )}
        </View>
      )}
      <View style={styles.main}>
        <Stack screenOptions={{ headerShown: false, animation: "none", contentStyle: { backgroundColor: color.bg } }} />
      </View>
      <TabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: color.bg },
  center: { flex: 1, justifyContent: "center", backgroundColor: color.bg },
  notices: { gap: space[2], padding: space[2] },
  main: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: size.border,
    borderTopColor: color.line,
    backgroundColor: color.bg,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: space[1], minHeight: size.tabBar, paddingBottom: space[1] },
  tabIndicator: { position: "absolute", top: 0, left: space[4], right: space[4], height: size.focusRing, borderBottomLeftRadius: radius.sm, borderBottomRightRadius: radius.sm },
  tabIndicatorActive: { backgroundColor: color.accent },
  tabLabel: { color: color.inkMuted },
  tabLabelActive: { color: color.ink, fontFamily: type.subheading.fontFamily },
  sosCell: { flex: 1.2, padding: space[2], justifyContent: "center" },
  sos: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[1],
    minHeight: size.tap,
    borderRadius: radius.md,
    backgroundColor: color.danger,
  },
  sosPressed: { backgroundColor: color.dangerPressed },
  sosSent: { backgroundColor: color.bg, borderWidth: size.borderStrong, borderColor: color.danger },
  sosSentPressed: { backgroundColor: color.dangerSoft },
});

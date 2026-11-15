import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PRIORITY_ROLE } from "../../api/types";
import { color, muted, radius, size, space, type } from "../../design/theme";
import { LOCALES, setLocale, t, useLocale } from "../../i18n";
import { errorText } from "../../lib/labels";
import { Mark } from "../../shell/Launch";
import { Banner, Button, ErrorState, IconButton, List, ListRow, SkeletonList, Switch } from "../../ui";
import { bannerContent } from "../banner";
import { useCitizen } from "../session";
import { useLocate } from "../useLocate";

const STEPS = 3;

/**
 * `/welcome`: first run. Language, then position, then the special-care
 * role; it ends on the map with a route already drawn.
 */
export function Welcome() {
  const locale = useLocale();
  const session = useCitizen();
  const [requested, setRequested] = useState(1);
  // The role step needs a plan; without one it falls back to the position step.
  const step = requested > 2 && !session.plan ? 2 : requested;
  const { locate, locating, errorText: locateError } = useLocate(() => setRequested(3));

  // Android back goes to the previous step instead of leaving the app.
  useEffect(() => {
    if (step === 1) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setRequested(step - 1);
      return true;
    });
    return () => subscription.remove();
  }, [step]);

  if (session.onboarded) return <Redirect href="/map" />;

  const finish = () => {
    session.completeOnboarding();
    router.replace("/map");
  };

  let body;
  let action = null;
  if (step === 1) {
    body = (
      <>
        <View style={styles.brand}>
          <Mark size="lg" />
          <Text style={[type.smallMedium, muted]}>{t("app.name")}</Text>
        </View>
        <Text style={type.display} accessibilityRole="header">{t("welcome.languageTitle")}</Text>
        <Text style={[type.body, muted]}>{t("welcome.languageText")}</Text>
        <View style={styles.bleed}>
          <List label={t("app.language")}>
            {LOCALES.map((item) => (
              <ListRow
                key={item.code}
                title={item.name}
                icon="globe"
                selected={locale === item.code}
                onPress={() => setLocale(item.code)}
              />
            ))}
          </List>
        </View>
      </>
    );
    action = (
      <Button variant="primary" size="lg" icon="arrowRight" block onPress={() => setRequested(2)}>
        {t("welcome.continue")}
      </Button>
    );
  } else if (step === 2) {
    const routeError = session.banner?.kind === "error" ? bannerContent(session.banner).text : null;
    const problem = locateError ?? routeError;
    body = (
      <>
        <Text style={type.display} accessibilityRole="header">{t("citizen.whereAreYou")}</Text>
        <Text style={[type.body, muted]}>{t("welcome.locationText")}</Text>
        {session.boot === "error" ? (
          <ErrorState title={t("errors.loadTitle")} retryLabel={t("app.retry")} onRetry={session.retryBoot}>
            {errorText(session.bootError)}
          </ErrorState>
        ) : (
          <>
            <Button variant="primary" size="lg" icon="locate" block busy={locating} onPress={() => void locate()}>
              {t(locating ? "citizen.locating" : "citizen.shareLocation")}
            </Button>
            {problem && <Banner tone="danger">{problem}</Banner>}
            <Text style={type.heading} accessibilityRole="header">{t("citizen.orDistrict")}</Text>
            {session.boot === "loading" ? (
              <SkeletonList rows={4} label={t("app.loading")} />
            ) : (
              <View style={styles.bleed}>
                <List label={t("citizen.chooseDistrict")}>
                  {(session.meta?.zones ?? []).map((zone) => (
                    <ListRow
                      key={zone.id}
                      title={zone.name}
                      icon="pin"
                      selected={zone.id === session.zoneId && Boolean(session.plan)}
                      onPress={() => {
                        if (session.planning) return;
                        void session.chooseZone(zone.id).then((ok) => ok && setRequested(3));
                      }}
                    />
                  ))}
                </List>
              </View>
            )}
          </>
        )}
      </>
    );
  } else {
    body = (
      <>
        <Text style={type.display} accessibilityRole="header">{t("welcome.roleTitle")}</Text>
        <Text style={[type.body, muted]}>{t("welcome.roleText")}</Text>
        <Switch
          checked={session.priority}
          onChange={(on) => session.setRole(on ? PRIORITY_ROLE : "standard")}
          label={t("citizen.role.title")}
          description={t("citizen.role.desc")}
          icon="accessible"
          tone="priority"
        />
      </>
    );
    action = (
      <Button variant="primary" size="lg" icon="route" block busy={session.planning} onPress={finish}>
        {t("welcome.finish")}
      </Button>
    );
  }

  const stepLabel = t("welcome.step", { step, total: STEPS });
  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <View style={styles.progress}>
        {step > 1 ? (
          <IconButton icon="chevronLeft" label={t("app.back")} onPress={() => setRequested(step - 1)} />
        ) : (
          <View style={styles.spacer} />
        )}
        <View style={styles.steps} accessible accessibilityRole="progressbar" accessibilityLabel={stepLabel}>
          {Array.from({ length: STEPS }, (_, index) => (
            <View key={index} style={[styles.stepBar, index < step && styles.stepDone]} />
          ))}
        </View>
        <Text style={[type.small, muted]}>{stepLabel}</Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
      {action && <View style={styles.footer}>{action}</View>}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  progress: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    minHeight: size.topBar,
    paddingHorizontal: space[4],
  },
  spacer: { width: size.tap, height: size.tap },
  steps: { flex: 1, flexDirection: "row", gap: space[1] },
  stepBar: { flex: 1, height: space[1], borderRadius: radius.full, backgroundColor: color.surfaceSunken },
  stepDone: { backgroundColor: color.ink },
  scroll: { flex: 1 },
  body: { padding: space[4], paddingTop: space[5], gap: space[4] },
  bleed: { marginHorizontal: -space[4] },
  brand: { flexDirection: "row", alignItems: "center", gap: space[3] },
  footer: { padding: space[4] },
});

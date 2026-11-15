import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CRITICAL_PRIORITY } from "../../api/types";
import { color, fontSize, muted, radius, size, space, type } from "../../design/theme";
import { t } from "../../i18n";
import { formatTime } from "../../lib/format";
import { TopBar } from "../../shell/parts";
import { Badge, Banner, Button, hazardIcon, Icon } from "../../ui";
import { LocationSheet } from "../LocationSheet";
import { SOS_UNDO_MS, useCitizen } from "../session";

const hazardLabel = (code: string, fallback?: string) => t(`hazard.${code}`, undefined, fallback ?? code);

/** Seconds left in the undo window, refreshed a few times a second. */
function useCountdown(sendAt: number | undefined): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (sendAt === undefined) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [sendAt]);
  return sendAt === undefined ? 0 : Math.max(0, Math.ceil((sendAt - now) / 1000));
}

/** A bar that drains over the undo window. */
function CountdownBar({ sendAt }: { sendAt: number }) {
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const remaining = Math.max(0, sendAt - Date.now());
    progress.setValue(remaining / SOS_UNDO_MS);
    const animation = Animated.timing(progress, {
      toValue: 0,
      duration: remaining,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [sendAt, progress]);
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  return (
    <View style={styles.countdownTrack} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Animated.View style={[styles.countdownFill, { width }]} />
    </View>
  );
}

function StatusCard({ tone, children }: { tone: "sent" | "priority" | "safe" | "pending"; children: React.ReactNode }) {
  return (
    <View style={[styles.card, cardTone[tone]]} accessible accessibilityLiveRegion="polite">
      {children}
    </View>
  );
}

/**
 * `/sos`: call for help and see what happened.
 *
 * Two deliberate taps send an SOS: the SOS action opens this screen, a
 * hazard button sends. A 5-second undo window runs before the signal leaves
 * the device (the server has no way to withdraw one).
 */
export function SosScreen() {
  const session = useCitizen();
  const { sos, pendingSos, sosBusy, sosResult, safe, priority, plan } = session;
  const [choosing, setChoosing] = useState(false);
  const seconds = useCountdown(pendingSos?.sendAt);

  let body;
  let actions = null;
  if (sos) {
    const isPriority = sos.priority === CRITICAL_PRIORITY;
    body = (
      <>
        <StatusCard tone={isPriority ? "priority" : "sent"}>
          <Icon name="check" size="xl" color={isPriority ? color.priorityText : color.dangerText} />
          <Text style={[type.title, styles.center]} accessibilityRole="header">
            {t(isPriority ? "citizen.sosPrioritySent" : "citizen.sosSent")}
          </Text>
          {isPriority && <Badge tone="priority" solid icon="accessible">{t("citizen.role.badge")}</Badge>}
          <Text style={[type.body, styles.center]}>
            {t("citizen.sosSentDetail", { hazard: hazardLabel(sos.hazard_type), time: formatTime(sos.created_at) })}
          </Text>
          <Text style={[type.body, styles.center]}>{t("sos.notified")}</Text>
        </StatusCard>
        {sosResult === "duplicate" && <Banner tone="info">{t("citizen.sosDuplicate")}</Banner>}
      </>
    );
    actions = (
      <>
        {plan?.reachable && (
          <Button variant="primary" size="lg" icon="route" block onPress={() => router.navigate("/map")}>
            {t("sos.showRoute")}
          </Button>
        )}
        <Button size="lg" icon="check" block busy={session.safeBusy} onPress={() => void session.markSafe()}>
          {t("citizen.imSafe")}
        </Button>
      </>
    );
  } else if (pendingSos || sosBusy) {
    body = (
      <StatusCard tone="pending">
        {pendingSos ? (
          <Text style={styles.countdown} importantForAccessibility="no" accessibilityElementsHidden>{seconds}</Text>
        ) : (
          <ActivityIndicator color={color.dangerText} />
        )}
        <Text style={[type.title, styles.center]} accessibilityRole="header">
          {pendingSos
            ? t("sos.pendingTitle", { hazard: hazardLabel(pendingSos.hazard), seconds })
            : t("citizen.sosSending")}
        </Text>
        {pendingSos && <CountdownBar sendAt={pendingSos.sendAt} />}
      </StatusCard>
    );
    if (pendingSos) {
      actions = (
        <>
          <Button variant="danger" size="lg" icon="sos" block onPress={session.sendSosNow}>{t("sos.sendNow")}</Button>
          <Button size="lg" icon="undo" block onPress={session.undoSos}>{t("sos.undo")}</Button>
        </>
      );
    }
  } else if (safe) {
    body = (
      <StatusCard tone="safe">
        <Icon name="check" size="xl" color={color.okText} />
        <Text style={[type.title, styles.center]} accessibilityRole="header">{t("citizen.safeTitle")}</Text>
        <Text style={[type.body, styles.center]}>{t("citizen.safeDetail")}</Text>
      </StatusCard>
    );
    actions = (
      <>
        <Button variant="primary" size="lg" icon="map" block onPress={() => router.navigate("/map")}>
          {t("sos.backToMap")}
        </Button>
        <Button size="lg" icon="sos" block onPress={session.clearSafe}>{t("citizen.needHelpAgain")}</Button>
      </>
    );
  } else {
    body = (
      <>
        <View style={styles.intro}>
          <Text style={type.title} accessibilityRole="header">{t("citizen.hazardQuestion")}</Text>
          <Text style={[type.body, muted]}>{t(priority ? "sos.chooserPriority" : "sos.chooserText")}</Text>
        </View>
        {sosResult === "needPosition" && (
          <Banner
            tone="danger"
            actions={<Button icon="pin" onPress={() => setChoosing(true)}>{t("points.setPosition")}</Button>}
          >
            {t("citizen.pickLocationFirst")}
          </Banner>
        )}
      </>
    );
    actions = (
      <View style={styles.hazards}>
        {(session.meta?.hazards ?? []).map((hazard) => {
          const label = hazardLabel(hazard.code, hazard.label);
          return (
            <Pressable
              key={hazard.code}
              accessibilityRole="button"
              accessibilityLabel={label}
              onPress={() => session.startSos(hazard.code)}
              style={({ pressed }) => [styles.hazard, pressed && styles.hazardPressed]}
            >
              {({ pressed }) => (
                <>
                  <Icon name={hazardIcon(hazard.code)} size="xl" color={pressed ? color.onDanger : color.dangerText} />
                  <Text style={[type.heading, styles.center, pressed && styles.onDanger]}>{label}</Text>
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <TopBar
        title={t("citizen.sos")}
        trailing={priority ? <Badge tone="priority" icon="accessible">{t("citizen.role.badge")}</Badge> : undefined}
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>{body}</ScrollView>
      {actions && <View style={styles.footer}>{actions}</View>}
      <LocationSheet open={choosing} onClose={() => setChoosing(false)} />
    </View>
  );
}

const cardTone = StyleSheet.create({
  sent: { backgroundColor: color.dangerSoft },
  priority: { backgroundColor: color.prioritySoft },
  safe: { backgroundColor: color.okSoft },
  pending: { backgroundColor: color.dangerSoft },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  scroll: { flex: 1 },
  body: { padding: space[4], gap: space[4] },
  intro: { gap: space[1] },
  center: { textAlign: "center" },
  footer: { padding: space[4], gap: space[2] },
  card: {
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[6],
    paddingHorizontal: space[4],
    borderRadius: radius.lg,
  },
  countdown: {
    ...type.display,
    fontSize: fontSize.display,
    lineHeight: fontSize.display,
    color: color.dangerText,
  },
  countdownTrack: {
    alignSelf: "stretch",
    height: size.meter,
    borderRadius: radius.full,
    backgroundColor: color.bg,
    overflow: "hidden",
  },
  countdownFill: { height: "100%", backgroundColor: color.danger },
  hazards: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
  hazard: {
    flexBasis: "45%",
    flexGrow: 1,
    minHeight: size.hazard,
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    padding: space[3],
    borderWidth: size.borderStrong,
    borderColor: color.danger,
    borderRadius: radius.lg,
    backgroundColor: color.bg,
  },
  hazardPressed: { backgroundColor: color.danger },
  onDanger: { color: color.onDanger },
});

import { useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated, StyleSheet, Text, View } from "react-native";
import type { DimensionValue } from "react-native";
import { color, density, motion, muted, radius, shadows, size, space, tones, type } from "../design/theme";
import { Button, IconButton } from "./Button";
import { Icon, type IconName } from "./Icon";

export type Tone = "info" | "ok" | "warn" | "danger" | "priority";

const TONE_ICON: Record<Tone, IconName> = { info: "info", ok: "check", warn: "alert", danger: "alert", priority: "accessible" };
/** Border colour per tone, as on the web banner. */
const TONE_LINE: Record<Tone, string> = {
  info: color.accent,
  ok: color.ok,
  warn: color.warnText,
  danger: color.danger,
  priority: color.priority,
};

interface BannerProps {
  tone?: Tone;
  icon?: IconName;
  title?: string;
  children?: string;
  /** Buttons shown under the text. */
  actions?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}

/** A message that stays until it is dismissed or the state behind it changes. */
export function Banner({ tone = "info", icon, title, children, actions, onDismiss, dismissLabel }: BannerProps) {
  return (
    <View style={[styles.banner, { backgroundColor: tones[tone].soft, borderColor: TONE_LINE[tone] }]} accessibilityRole="alert">
      <View style={styles.bannerIcon}>
        <Icon name={icon ?? TONE_ICON[tone]} color={tones[tone].icon} />
      </View>
      <View style={styles.bannerBody}>
        {title ? <Text style={type.subheading}>{title}</Text> : null}
        {children ? <Text style={[type.body, styles.snug]}>{children}</Text> : null}
        {actions ? <View style={styles.bannerActions}>{actions}</View> : null}
      </View>
      {onDismiss && dismissLabel ? <IconButton icon="close" label={dismissLabel} onPress={onDismiss} /> : null}
    </View>
  );
}

interface BadgeProps {
  tone?: "neutral" | "accent" | "danger" | "ok" | "warn" | "priority";
  /** Filled instead of tinted. */
  solid?: boolean;
  icon?: IconName;
  children: string;
}

export function Badge({ tone = "neutral", solid, icon, children }: BadgeProps) {
  const look = tones[tone];
  const foreground = solid ? look.on : look.text;
  return (
    <View style={[styles.badge, { backgroundColor: solid ? look.fill : look.soft }]}>
      {icon && <Icon name={icon} size="sm" color={foreground} />}
      <Text style={[type.label, styles.badgeText, { color: foreground }]}>{children}</Text>
    </View>
  );
}

interface StateProps {
  icon?: IconName;
  title: string;
  children?: string;
  action?: ReactNode;
}

/** Nothing to show yet, with the next step. */
export function EmptyState({ icon = "info", title, children, action }: StateProps) {
  return (
    <View style={styles.state}>
      <Icon name={icon} size="xl" color={color.inkMuted} />
      <Text style={[type.heading, styles.center]} accessibilityRole="header">{title}</Text>
      {children ? <Text style={[type.body, muted, styles.center]}>{children}</Text> : null}
      {action ? <View style={styles.stateAction}>{action}</View> : null}
    </View>
  );
}

interface ErrorProps {
  title: string;
  children?: string;
  retryLabel: string;
  onRetry: () => void;
  busy?: boolean;
}

/** Something failed, with a way to try again. */
export function ErrorState({ title, children, retryLabel, onRetry, busy }: ErrorProps) {
  return (
    <View style={styles.state} accessibilityRole="alert">
      <Icon name="alert" size="xl" color={color.dangerText} />
      <Text style={[type.heading, styles.center]}>{title}</Text>
      {children ? <Text style={[type.body, muted, styles.center]}>{children}</Text> : null}
      <View style={styles.stateAction}>
        <Button variant="primary" icon="reset" onPress={onRetry} busy={busy}>{retryLabel}</Button>
      </View>
    </View>
  );
}

/** Opacity pulse shared by skeleton lines; rests when the system asks for reduced motion. */
function usePulse(): Animated.Value {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (reduced || cancelled) return;
      const half = motion.duration.slow * 2;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.45, duration: half, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1, duration: half, useNativeDriver: true }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [opacity]);
  return opacity;
}

const LINE_WIDTHS: DimensionValue[] = ["100%", "70%", "45%"];

/** Placeholder lines while content loads. */
export function Skeleton({ lines = 3, label }: { lines?: number; label: string }) {
  const opacity = usePulse();
  return (
    <Animated.View style={[styles.skeleton, { opacity }]} accessibilityRole="progressbar" accessibilityLabel={label}>
      {Array.from({ length: lines }, (_, index) => (
        <View key={index} style={[styles.skeletonLine, { width: LINE_WIDTHS[index % LINE_WIDTHS.length] }]} />
      ))}
    </Animated.View>
  );
}

/** Placeholder for a list of rows. */
export function SkeletonList({ rows = 4, label }: { rows?: number; label: string }) {
  const opacity = usePulse();
  return (
    <Animated.View style={{ opacity }} accessibilityRole="progressbar" accessibilityLabel={label}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={styles.skeletonRow}>
          <View style={[styles.skeletonLine, { width: LINE_WIDTHS[1] }]} />
          <View style={[styles.skeletonLine, { width: LINE_WIDTHS[2] }]} />
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    paddingVertical: space[3],
    paddingLeft: space[4],
    paddingRight: space[3],
    borderWidth: size.border,
    borderRadius: radius.md,
    ...shadows.raised,
  },
  bannerIcon: { minHeight: size.tap, justifyContent: "center" },
  bannerBody: { flex: 1, minHeight: size.tap, justifyContent: "center", gap: space[1] },
  bannerActions: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[2] },
  snug: { lineHeight: type.bodyMedium.lineHeight },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: space[1],
    paddingVertical: space[1],
    paddingHorizontal: space[2],
    borderRadius: radius.sm,
  },
  badgeText: { flexShrink: 1 },
  state: { alignItems: "center", gap: space[3], paddingVertical: space[7], paddingHorizontal: space[5] },
  stateAction: { marginTop: space[2], alignItems: "center" },
  center: { textAlign: "center" },
  skeleton: { gap: space[3], paddingVertical: space[2] },
  skeletonLine: { height: size.skeletonLine, borderRadius: radius.sm, backgroundColor: color.surfaceSunken },
  skeletonRow: {
    justifyContent: "center",
    gap: space[2],
    minHeight: density.comfortable.rowHeight,
    paddingVertical: space[3],
    paddingHorizontal: density.comfortable.rowPadding,
    borderBottomWidth: size.border,
    borderBottomColor: color.line,
  },
});

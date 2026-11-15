/** Small pieces shared at the shell level. */
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { color, size, space, type } from "../design/theme";
import { LOCALES, setLocale, t, useLocale } from "../i18n";
import { Icon, IconButton, SegmentedControl } from "../ui";

interface TopBarProps {
  title: string;
  /** Shows a back button. */
  onBack?: () => void;
  trailing?: ReactNode;
}

/** Screen title with an optional back button. */
export function TopBar({ title, onBack, trailing }: TopBarProps) {
  return (
    <View style={styles.topBar}>
      {onBack && <IconButton icon="chevronLeft" label={t("app.back")} onPress={onBack} />}
      <Text style={[type.title, styles.title]} accessibilityRole="header">{title}</Text>
      {trailing}
    </View>
  );
}

/** AZ | EN. Switches the whole UI at once. */
export function LanguageControl() {
  const locale = useLocale();
  return (
    <SegmentedControl
      label={t("app.language")}
      value={locale}
      onChange={setLocale}
      options={LOCALES.map((item) => ({ value: item.code, label: item.label, name: item.name }))}
    />
  );
}

/** Live / offline indicator. Text and icon, never colour alone. */
export function ConnectionStatus({ connected }: { connected: boolean }) {
  const tint = connected ? color.okText : color.warnText;
  return (
    <View style={styles.connection} accessible accessibilityRole="text">
      <Icon name={connected ? "live" : "offline"} size="sm" color={tint} />
      <Text style={[type.smallMedium, { color: tint }]}>{t(connected ? "app.online" : "app.offline")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Same side inset as the screen content below it, so the title lines up with it.
  topBar: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: size.topBar, paddingHorizontal: space[4] },
  title: { flex: 1 },
  connection: { flexDirection: "row", alignItems: "center", gap: space[1] },
});

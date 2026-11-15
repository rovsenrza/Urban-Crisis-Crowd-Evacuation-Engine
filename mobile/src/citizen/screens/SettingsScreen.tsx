import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { PRIORITY_ROLE } from "../../api/types";
import { color, muted, radius, size, space, type } from "../../design/theme";
import { t } from "../../i18n";
import { ConnectionStatus, LanguageControl, TopBar } from "../../shell/parts";
import { Icon, ListRow, Switch } from "../../ui";
import { useCitizen } from "../session";

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={[type.smallMedium, muted]} accessibilityRole="header">{title}</Text>
      {children}
    </View>
  );
}

/** `/settings`: one-off settings, kept off the main screen. The dispatcher console is web-only, so it has no entry here. */
export function SettingsScreen() {
  const { priority, setRole, connected } = useCitizen();
  return (
    <View style={styles.screen}>
      <TopBar title={t("tabs.settings")} trailing={<ConnectionStatus connected={connected} />} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.body}>
        <Group title={t("settings.role")}>
          <Switch
            checked={priority}
            onChange={(on) => setRole(on ? PRIORITY_ROLE : "standard")}
            label={t("citizen.role.title")}
            description={t("citizen.role.desc")}
            icon="accessible"
            tone="priority"
          />
        </Group>

        <Group title={t("app.language")}>
          <LanguageControl />
        </Group>

        <Group title={t("settings.privacy")}>
          <View style={styles.privacy}>
            <Icon name="lock" color={color.inkMuted} />
            <Text style={[type.body, styles.privacyText]}>{t("settings.privacyText")}</Text>
          </View>
        </Group>

        {/* The dispatcher console is part of this app: sign-in first, then the console. */}
        <Group title={t("settings.dispatcher")}>
          <View style={styles.link}>
            <ListRow
              icon="shield"
              title={t("settings.dispatcherLink")}
              subtitle={t("settings.dispatcherText")}
              chevron
              onPress={() => router.push("/operator/live")}
            />
          </View>
        </Group>

        <Text style={[type.small, muted, styles.about]}>{t("app.title")}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  scroll: { flex: 1 },
  body: { padding: space[4], gap: space[5] },
  group: { gap: space[2] },
  privacy: {
    flexDirection: "row",
    gap: space[3],
    padding: space[4],
    borderRadius: radius.md,
    backgroundColor: color.surface,
  },
  privacyText: { flex: 1 },
  link: { borderWidth: size.border, borderColor: color.lineStrong, borderRadius: radius.md, overflow: "hidden" },
  about: { textAlign: "center" },
});

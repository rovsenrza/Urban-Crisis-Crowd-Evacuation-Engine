import { router } from "expo-router";
import { View } from "react-native";
import { useLocale, t } from "../i18n";
import { Button, EmptyState } from "../ui";

/** Unknown deep link. */
export default function NotFound() {
  useLocale();
  return (
    <View style={{ flex: 1, justifyContent: "center" }}>
      <EmptyState
        icon="map"
        title={t("notFound.title")}
        action={<Button variant="primary" icon="arrowRight" onPress={() => router.replace("/map")}>{t("notFound.action")}</Button>}
      >
        {t("notFound.text")}
      </EmptyState>
    </View>
  );
}

import { Redirect, router, type Href } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../../api/client";
import { color, muted, radius, space, type } from "../../design/theme";
import { t } from "../../i18n";
import { errorText } from "../../lib/labels";
import { Mark } from "../../shell/Launch";
import { LanguageControl } from "../../shell/parts";
import { Banner, Button, TextField } from "../../ui";
import { useOperator } from "../session";

/** Dispatcher sign-in. */
export function OperatorLogin() {
  const { token, login, expired, meta } = useOperator();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // Kept as a function so the message follows the language switch.
  const [error, setError] = useState<(() => string) | null>(null);
  const [busy, setBusy] = useState(false);

  if (token) return <Redirect href={"/operator/live" as Href} />;

  const submit = async () => {
    if (!username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      const invalid = err instanceof ApiError && err.status === 401;
      setError(() => () => (invalid ? t("operator.loginFailed") : errorText(err)));
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <Mark />
            <View style={styles.language}><LanguageControl /></View>
          </View>
          <View style={styles.heading}>
            <Text style={type.display} accessibilityRole="header">{t("operator.loginTitle")}</Text>
            <Text style={[type.body, muted]}>{t("app.title")}</Text>
          </View>
          {expired && !error ? <Banner tone="warn">{t("errors.unauthorized")}</Banner> : null}
          <TextField
            label={t("operator.username")}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoComplete="username"
            returnKeyType="next"
          />
          <TextField
            label={t("operator.password")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
          {error ? <Banner tone="danger">{error()}</Banner> : null}
          <Button variant="primary" size="lg" block busy={busy} onPress={() => void submit()}>{t("operator.login")}</Button>
          {/* Demo credentials are shown only on a server that runs with the simulator on. */}
          {meta?.sim_enabled ? <Text style={[type.small, muted, styles.hint]}>{t("operator.loginHint")}</Text> : null}
          <Button variant="quiet" icon="chevronLeft" onPress={() => router.replace("/settings")}>{t("operator.backToCitizen")}</Button>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  flex: { flex: 1 },
  body: { flexGrow: 1, padding: space[4], gap: space[4] },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space[4] },
  language: { flex: 1, maxWidth: "50%" },
  heading: { gap: space[1], marginTop: space[4] },
  hint: { padding: space[3], borderRadius: radius.sm, backgroundColor: color.surface },
});

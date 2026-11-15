import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Alert } from "../api/types";
import { color, muted, space, type } from "../design/theme";
import { t } from "../i18n";
import { Button, TextField } from "../ui";
import { useOperator } from "./session";

interface Props {
  alert: Alert;
  /** `inverse` sits on the red pinned bar. */
  surface?: "plain" | "inverse";
}

/** Confirm in one action, or dismiss with a reason. Used by the pinned alert and the alert detail. */
export function AlertActions({ alert, surface = "plain" }: Props) {
  const { confirmAlert, dismissAlert, can } = useOperator();
  const [busy, setBusy] = useState<"confirm" | "dismiss" | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState(false);
  const inverse = surface === "inverse";

  const confirm = async () => {
    setBusy("confirm");
    await confirmAlert(alert);
    setBusy(null);
  };

  const submit = async () => {
    if (!reason.trim()) return setMissing(true);
    setBusy("dismiss");
    await dismissAlert(alert, reason.trim());
    setBusy(null);
  };

  // Observers see the alert but get no controls they could not use.
  if (!can("decide")) {
    return <Text style={[type.small, inverse ? styles.onDanger : muted]}>{t("role.readOnly")}</Text>;
  }

  if (dismissing) {
    return (
      <View style={[styles.form, inverse && styles.formInverse]}>
        <TextField
          label={t("alert.dismissReason")}
          value={reason}
          onChangeText={(value) => { setReason(value); setMissing(false); }}
          error={missing ? t("errors.code.reason_required") : undefined}
          placeholder={t("alert.dismissPlaceholder")}
          autoFocus
          maxLength={500}
          returnKeyType="send"
          onSubmitEditing={() => void submit()}
        />
        <View style={styles.row}>
          <View style={styles.cell}>
            <Button variant="danger" block busy={busy === "dismiss"} onPress={() => void submit()}>{t("alert.dismissSubmit")}</Button>
          </View>
          <View style={styles.cell}>
            <Button block onPress={() => setDismissing(false)}>{t("app.cancel")}</Button>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <View style={styles.cell}>
        <Button variant={inverse ? "inverse" : "danger"} icon="check" block busy={busy === "confirm"} onPress={() => void confirm()}>
          {t(busy === "confirm" ? "alert.confirming" : "alert.confirm")}
        </Button>
      </View>
      <View style={styles.cell}>
        <Button variant={inverse ? "inverse" : "secondary"} block disabled={busy !== null} onPress={() => setDismissing(true)}>
          {t("alert.dismiss")}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space[2] },
  cell: { flex: 1 },
  form: { gap: space[3] },
  // On the red bar the form sits on its own white ground so the field stays readable.
  formInverse: { padding: space[3], borderRadius: space[2], backgroundColor: color.bg },
  onDanger: { color: color.onDanger },
});

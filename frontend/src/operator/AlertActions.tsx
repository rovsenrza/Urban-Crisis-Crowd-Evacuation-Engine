import { useState, type FormEvent } from "react";
import type { Alert } from "../api/types";
import { t } from "../i18n";
import { Button, Field, TextInput } from "../ui";
import { useOperator } from "./session";

interface Props {
  alert: Alert;
  /** `inverse` sits on the red pinned banner. */
  surface?: "plain" | "inverse";
}

/** Confirm in one action, or dismiss with a reason. Used by the pinned alert and the alert detail. */
export function AlertActions({ alert, surface = "plain" }: Props) {
  const { confirmAlert, dismissAlert, can } = useOperator();
  const [busy, setBusy] = useState<"confirm" | "dismiss" | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState(false);

  const confirm = async () => {
    setBusy("confirm");
    await confirmAlert(alert);
    setBusy(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) return setMissing(true);
    setBusy("dismiss");
    await dismissAlert(alert, reason.trim());
    setBusy(null);
  };

  // Observers see the alert but get no controls they could not use.
  if (!can("decide")) return <p className="alert-actions alert-actions__readonly">{t("role.readOnly")}</p>;

  if (dismissing) {
    return (
      <form className="alert-actions alert-actions--form" onSubmit={(event) => void submit(event)}>
        <Field label={t("alert.dismissReason")} error={missing ? t("errors.code.reason_required") : undefined}>
          {(props) => (
            <TextInput
              {...props}
              autoFocus
              value={reason}
              onChange={(event) => { setReason(event.target.value); setMissing(false); }}
              placeholder={t("alert.dismissPlaceholder")}
              maxLength={500}
            />
          )}
        </Field>
        <div className="alert-actions__row">
          <Button type="submit" variant={surface === "inverse" ? "inverse" : "danger"} busy={busy === "dismiss"}>
            {t("alert.dismissSubmit")}
          </Button>
          <Button variant={surface === "inverse" ? "inverse" : "secondary"} onClick={() => setDismissing(false)}>{t("app.cancel")}</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="alert-actions alert-actions__row">
      <Button variant={surface === "inverse" ? "inverse" : "danger"} icon="check" busy={busy === "confirm"} onClick={() => void confirm()}>
        {t(busy === "confirm" ? "alert.confirming" : "alert.confirm")}
      </Button>
      <Button variant={surface === "inverse" ? "inverse" : "secondary"} disabled={busy !== null} onClick={() => setDismissing(true)}>
        {t("alert.dismiss")}
      </Button>
    </div>
  );
}

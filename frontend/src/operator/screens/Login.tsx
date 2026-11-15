import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ApiError } from "../../api/client";
import { t, useLocale } from "../../i18n";
import { errorText } from "../../lib/labels";
import { Mark } from "../../shell/Launch";
import { LanguageControl } from "../../shell/parts";
import { Banner, Button, Field, TextInput } from "../../ui";
import { useOperator } from "../session";

/** `/operator/login`. */
export function Login() {
  useLocale();
  const { token, login, expired, meta } = useOperator();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // Kept as a function so the message follows the language switch.
  const [error, setError] = useState<(() => string) | null>(null);
  const [busy, setBusy] = useState(false);

  if (token) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from.startsWith("/operator/") ? from : "/operator/live"} replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err) {
      const invalid = err instanceof ApiError && err.status === 401;
      setError(() => () => (invalid ? t("operator.loginFailed") : errorText(err)));
      setBusy(false);
    }
  };

  return (
    <div className="login" data-density="compact">
      <form className="login__card" onSubmit={(event) => void submit(event)}>
        <div className="login__top">
          <Mark />
          <LanguageControl />
        </div>
        <div>
          <h1>{t("operator.loginTitle")}</h1>
          <p className="muted">{t("app.title")}</p>
        </div>
        {expired && !error && <Banner tone="warn">{t("errors.unauthorized")}</Banner>}
        <Field label={t("operator.username")}>
          {(props) => (
            <TextInput {...props} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required autoFocus />
          )}
        </Field>
        <Field label={t("operator.password")}>
          {(props) => (
            <TextInput {...props} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          )}
        </Field>
        {error && <Banner tone="danger" live="alert">{error()}</Banner>}
        <Button type="submit" variant="primary" size="lg" block busy={busy}>{t("operator.login")}</Button>
        {/* Demo credentials are shown only on a server that runs with the simulator on. */}
        {meta?.sim_enabled && <p className="login__hint">{t("operator.loginHint")}</p>}
        <Link to="/app/map">{t("operator.backToCitizen")}</Link>
      </form>
    </div>
  );
}

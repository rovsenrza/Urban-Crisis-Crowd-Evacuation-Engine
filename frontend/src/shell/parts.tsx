/** Small pieces both products share at the shell level. */
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LOCALES, setLocale, t, useLocale } from "../i18n";
import { ButtonLink, EmptyState, Icon, IconButton, SegmentedControl } from "../ui";
import "./shell.css";

/** AZ | EN. Switches the whole UI without a reload. */
export function LanguageControl() {
  const locale = useLocale();
  return (
    <SegmentedControl
      label={t("app.language")}
      value={locale}
      onChange={setLocale}
      options={LOCALES.map((item) => ({ value: item.code, label: item.label, name: item.name, lang: item.code }))}
    />
  );
}

/** Live / offline indicator. Text and icon, never colour alone. */
export function ConnectionStatus({ connected }: { connected: boolean }) {
  return (
    <span className={`connection${connected ? "" : " connection--off"}`} role="status">
      <Icon name={connected ? "live" : "offline"} size="sm" />
      {t(connected ? "app.online" : "app.offline")}
    </span>
  );
}

interface TopBarProps {
  title: string;
  /** Shows a back button that goes to this path. */
  backTo?: string;
  trailing?: ReactNode;
}

/** Screen title with an optional back button. */
export function TopBar({ title, backTo, trailing }: TopBarProps) {
  const navigate = useNavigate();
  return (
    <header className="topbar">
      {backTo && <IconButton icon="chevronLeft" label={t("app.back")} onClick={() => navigate(backTo)} />}
      <h1>{title}</h1>
      {trailing}
    </header>
  );
}

/** Unknown URL. Offers the two real entry points instead of redirecting silently. */
export function NotFound({ home = "/app/map" }: { home?: string }) {
  useLocale();
  return (
    <div className="notfound">
      <EmptyState
        icon="map"
        title={t("notFound.title")}
        action={<ButtonLink to={home} variant="primary" icon="arrowRight">{t("notFound.action")}</ButtonLink>}
      >
        {t("notFound.text")}
      </EmptyState>
      <Link to="/operator" className="notfound__alt">{t("settings.dispatcherLink")}</Link>
    </div>
  );
}

import { useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { CRITICAL_PRIORITY, type Meta } from "../api/types";
import { t, useLocale } from "../i18n";
import { errorText } from "../lib/labels";
import { Launch, Mark } from "../shell/Launch";
import { ConnectionStatus, LanguageControl } from "../shell/parts";
import { platform } from "../platform";
import { Badge, Button, ErrorState, Icon, List, ListRow, ModalSheet, Sidebar, TabBar, Toast, type NavItem } from "../ui";
import { AlertActions } from "./AlertActions";
import { describeAlert, ruleLabel } from "./describe";
import { OperatorSessionProvider, useOperator } from "./session";
import "./operator.css";

/** Holds the dispatcher session above sign-in and the console. */
export function OperatorRoot() {
  return (
    <OperatorSessionProvider>
      <Outlet />
    </OperatorSessionProvider>
  );
}

/** The open RED alert, pinned above every console screen: the one thing a dispatcher must never miss. */
function PinnedAlert({ meta }: { meta: Meta }) {
  const { state } = useOperator();
  const [current, ...waiting] = state.alerts;
  if (!current) return null;
  return (
    <section className="pinned-alert" role="alert" aria-label={t("alert.red")}>
      <div className="pinned-alert__text">
        <p className="pinned-alert__head">
          <Icon name="alert" />
          <strong>{t("alert.red")} №{current.id}</strong>
          <span>{ruleLabel(current)}</span>
          {waiting.length > 0 && <Badge>{t("alert.more", { count: waiting.length })}</Badge>}
        </p>
        <p>{describeAlert(current, state.zones, meta)}</p>
        <Link to={`/operator/alerts/${current.id}`} className="pinned-alert__link">{t("alert.details")}</Link>
      </div>
      {/* Keyed by alert: a half-typed dismissal never carries over to the next alert. */}
      <AlertActions key={current.id} alert={current} surface="inverse" />
    </section>
  );
}

/** `/operator/*` behind sign-in: navigation, the pinned alert, the screen, toasts. */
export function OperatorShell() {
  useLocale();
  const session = useOperator();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!session.token) return <Navigate to="/operator/login" replace state={{ from: location.pathname }} />;
  if (session.status === "error") {
    return (
      <div className="console console--center" data-density="compact">
        <ErrorState title={t("errors.loadTitle")} retryLabel={t("app.retry")} onRetry={session.retry}>
          {errorText(session.error)}
        </ErrorState>
        <Button variant="quiet" icon="signOut" onClick={session.logout}>{t("operator.logout")}</Button>
      </div>
    );
  }
  if (session.status !== "ready" || !session.meta) return <Launch label={t("app.loading")} />;

  const { state, meta } = session;
  const priorityCount = state.sos.filter((s) => s.priority === CRITICAL_PRIORITY).length;
  const primary: NavItem[] = [
    { to: "/operator/live", label: t("nav.live"), icon: "map" },
    { to: "/operator/alerts", label: t("nav.alerts"), icon: "bell", count: state.alerts.length, tone: "danger" },
    { to: "/operator/sos", label: t("nav.sos"), icon: "sos", count: state.sos.length, tone: priorityCount ? "priority" : "neutral" },
    { to: "/operator/resources", label: t("nav.resources"), icon: "truck" },
  ];
  const secondary: NavItem[] = [
    { to: "/operator/audit", label: t("nav.audit"), icon: "clipboard" },
    ...(meta.sim_enabled && session.can("simulate") ? [{ to: "/operator/simulation", label: t("nav.simulation"), icon: "flask" as const }] : []),
  ];

  const identity = (
    <p className="console__identity">
      <Icon name="shield" size="sm" />
      {t("role.signedIn", { name: session.operator || t("operator.console"), role: t(`role.${session.role}`) })}
    </p>
  );

  return (
    // The first press anywhere unlocks alarm sound (browsers block audio until a gesture).
    <div className="console" data-density="compact" onPointerDown={platform.sound.unlock}>
      <Sidebar
        label={t("nav.label")}
        items={[...primary, ...secondary]}
        header={
          <div className="console__brand">
            <Mark />
            <span>{t("operator.console")}</span>
          </div>
        }
        footer={
          <>
            {identity}
            <ConnectionStatus connected={session.connected} />
            <LanguageControl />
            <Button icon="signOut" onClick={session.logout}>{t("operator.logout")}</Button>
          </>
        }
      />
      <div className="console__content">
        <PinnedAlert meta={meta} />
        {!session.connected && (
          <p className="console__offline" role="status">
            <Icon name="offline" size="sm" />
            {t("app.reconnecting")}
          </p>
        )}
        <main className="console__main">
          <Outlet />
        </main>
        <TabBar
          label={t("nav.label")}
          items={primary}
          action={
            <button type="button" className="ui-nav-item ui-nav-item--tab console__more" onClick={() => setMoreOpen(true)}>
              <span className="ui-nav-item__icon"><Icon name="more" /></span>
              <span className="ui-nav-item__label">{t("nav.more")}</span>
            </button>
          }
        />
      </div>

      <ModalSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t("nav.more")} closeLabel={t("app.close")}>
        <List>
          {secondary.map((item) => (
            <li key={item.to} onClick={() => setMoreOpen(false)}>
              <ListRow to={item.to} icon={item.icon} title={item.label} />
            </li>
          ))}
        </List>
        {identity}
        <ConnectionStatus connected={session.connected} />
        <LanguageControl />
        <Button icon="signOut" block onClick={session.logout}>{t("operator.logout")}</Button>
      </ModalSheet>

      {session.toast && (
        <Toast tone={session.toast.tone} onDismiss={session.dismissToast} dismissLabel={t("app.close")}>
          {session.toast.render()}
        </Toast>
      )}
    </div>
  );
}

/** Title row shared by console screens. */
export function ScreenHeader({ title, count, children }: { title: string; count?: number; children?: React.ReactNode }) {
  return (
    <header className="screen-header">
      <h1>
        {title}
        {count !== undefined && <span className="screen-header__count">{count}</span>}
      </h1>
      {children}
    </header>
  );
}

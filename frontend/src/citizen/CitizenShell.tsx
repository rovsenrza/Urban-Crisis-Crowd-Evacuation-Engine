import { Link, Navigate, Outlet } from "react-router-dom";
import { CRITICAL_PRIORITY } from "../api/types";
import { t, useLocale } from "../i18n";
import { errorText } from "../lib/labels";
import { Launch } from "../shell/Launch";
import { Banner, ErrorState, Icon, TabBar, type NavItem } from "../ui";
import { bannerContent } from "./banner";
import { CitizenSessionProvider, useCitizen } from "./session";
import "./citizen.css";

/** Holds the citizen session above `/welcome` and `/app`, so onboarding hands a drawn route to the map. */
export function CitizenRoot() {
  return (
    <CitizenSessionProvider>
      <Outlet />
    </CitizenSessionProvider>
  );
}

/** The persistent SOS action. It sits in the tab bar's row but is an action, not a tab. */
function SosAction() {
  const { sos, pendingSos } = useCitizen();
  const sent = Boolean(sos);
  const label = sent
    ? t(sos?.priority === CRITICAL_PRIORITY ? "citizen.sosPrioritySent" : "citizen.sosSent")
    : pendingSos
      ? t("sos.pendingShort")
      : t("citizen.sosHint");
  return (
    <Link to="/app/sos" className={`sos-action${sent ? " sos-action--sent" : ""}`} aria-label={`${t("citizen.sos")}: ${label}`}>
      {sent ? <Icon name="check" /> : <Icon name="sos" />}
      <span>{t("citizen.sos")}</span>
    </Link>
  );
}

/** `/app/*`: banner, the current screen, the tab bar and the SOS action. */
export function CitizenShell() {
  useLocale(); // re-render everything below when the language changes
  const session = useCitizen();

  if (!session.onboarded) return <Navigate to="/welcome" replace />;
  if (session.boot === "loading") return <Launch label={t("app.loading")} />;
  if (session.boot === "error") {
    return (
      <div className="app app--center">
        <ErrorState title={t("errors.loadTitle")} retryLabel={t("app.retry")} onRetry={session.retryBoot}>
          {errorText(session.bootError)}
        </ErrorState>
      </div>
    );
  }

  const tabs: NavItem[] = [
    { to: "/app/map", label: t("tabs.map"), icon: "map" },
    { to: "/app/points", label: t("tabs.points"), icon: "list" },
    { to: "/app/settings", label: t("tabs.settings"), icon: "settings" },
  ];
  const banner = session.banner && bannerContent(session.banner);
  // The external routing API is down: routes come from a local source. The
  // notice stays for as long as that is true, so it has no dismiss button.
  const fallback = session.plan?.routing_mode === "fallback";
  const fallbackSource = session.plan?.fallback_source ?? "local_graph";

  return (
    <div className="app">
      {(banner || fallback || !session.connected) && (
        <div className="app__notices">
          {fallback && (
            <Banner tone="warn" icon="offline" title={t("routing.fallbackTitle")}>
              {t(`routing.fallback.${fallbackSource}`)}
            </Banner>
          )}
          {!session.connected && (
            <Banner tone="warn" icon="offline">{t("app.reconnecting")}</Banner>
          )}
          {banner && session.banner && (
            <Banner
              tone={session.banner.tone}
              icon={session.banner.kind === "error" ? "alert" : "route"}
              title={banner.title}
              live="alert"
              onDismiss={session.dismissBanner}
              dismissLabel={t("app.close")}
            >
              {banner.text}
            </Banner>
          )}
        </div>
      )}
      <main className="app__main">
        <Outlet />
      </main>
      <TabBar label={t("tabs.label")} items={tabs} action={<SosAction />} />
    </div>
  );
}

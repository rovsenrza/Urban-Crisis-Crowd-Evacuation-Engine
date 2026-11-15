import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { PRIORITY_ROLE } from "../../api/types";
import { LOCALES, setLocale, t, useLocale } from "../../i18n";
import { errorText } from "../../lib/labels";
import { Mark } from "../../shell/Launch";
import { Banner, Button, ErrorState, IconButton, List, ListRow, SkeletonList, Switch } from "../../ui";
import { bannerContent } from "../banner";
import { useCitizen } from "../session";
import { useLocate } from "../useLocate";

const STEPS = 3;

/**
 * `/welcome`: first run. Language, then position, then the special-care
 * role; it ends on the map with a route already drawn.
 */
export function Welcome() {
  const locale = useLocale();
  const session = useCitizen();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = Number(params.get("step")) || 1;
  // Steps after the position step need a plan; a refresh on step 3 without one falls back to step 2.
  const step = Math.min(STEPS, Math.max(1, requested > 2 && !session.plan ? 2 : requested));
  const goTo = (next: number) => setParams({ step: String(next) });
  const { locate, locating, errorText: locateError } = useLocate(() => goTo(3));

  if (session.onboarded) return <Navigate to="/app/map" replace />;

  const finish = () => {
    session.completeOnboarding();
    navigate("/app/map", { replace: true });
  };

  let body;
  let action = null;
  if (step === 1) {
    body = (
      <>
        <div className="welcome__brand">
          <Mark size="lg" />
          <p className="eyebrow">{t("app.name")}</p>
        </div>
        <h1 className="welcome__title">{t("welcome.languageTitle")}</h1>
        <p className="muted">{t("welcome.languageText")}</p>
        <List label={t("app.language")}>
          {LOCALES.map((item) => (
            <li key={item.code}>
              <ListRow
                title={<span lang={item.code}>{item.name}</span>}
                icon="globe"
                selected={locale === item.code}
                onPress={() => setLocale(item.code)}
              />
            </li>
          ))}
        </List>
      </>
    );
    action = <Button variant="primary" size="lg" icon="arrowRight" block onClick={() => goTo(2)}>{t("welcome.continue")}</Button>;
  } else if (step === 2) {
    const routeError = session.banner?.kind === "error" ? bannerContent(session.banner).text : null;
    body = (
      <>
        <h1 className="welcome__title">{t("citizen.whereAreYou")}</h1>
        <p className="muted">{t("welcome.locationText")}</p>
        {session.boot === "error" ? (
          <ErrorState title={t("errors.loadTitle")} retryLabel={t("app.retry")} onRetry={session.retryBoot}>
            {errorText(session.bootError)}
          </ErrorState>
        ) : (
          <>
            <Button variant="primary" size="lg" icon="locate" block busy={locating} onClick={() => void locate()}>
              {t(locating ? "citizen.locating" : "citizen.shareLocation")}
            </Button>
            {(locateError || routeError) && <Banner tone="danger" live="alert">{locateError ?? routeError}</Banner>}
            <h2>{t("citizen.orDistrict")}</h2>
            {session.boot === "loading" ? (
              <SkeletonList rows={4} label={t("app.loading")} />
            ) : (
              <List label={t("citizen.chooseDistrict")}>
                {session.meta?.zones.map((zone) => (
                  <li key={zone.id}>
                    <ListRow
                      title={zone.name}
                      icon="pin"
                      selected={zone.id === session.zoneId && Boolean(session.plan)}
                      onPress={() => {
                        if (session.planning) return;
                        void session.chooseZone(zone.id).then((ok) => ok && goTo(3));
                      }}
                    />
                  </li>
                ))}
              </List>
            )}
          </>
        )}
      </>
    );
  } else {
    body = (
      <>
        <h1 className="welcome__title">{t("welcome.roleTitle")}</h1>
        <p className="muted">{t("welcome.roleText")}</p>
        <Switch
          checked={session.priority}
          onChange={(on) => session.setRole(on ? PRIORITY_ROLE : "standard")}
          label={t("citizen.role.title")}
          description={t("citizen.role.desc")}
          icon="accessible"
          tone="priority"
        />
      </>
    );
    action = (
      <Button variant="primary" size="lg" icon="route" block busy={session.planning} onClick={finish}>
        {t("welcome.finish")}
      </Button>
    );
  }

  return (
    <div className="app">
      <main className="welcome">
        <header className="welcome__progress">
          {step > 1 ? (
            <IconButton icon="chevronLeft" label={t("app.back")} onClick={() => goTo(step - 1)} />
          ) : (
            <span className="welcome__spacer" />
          )}
          <span className="steps" role="img" aria-label={t("welcome.step", { step, total: STEPS })}>
            {Array.from({ length: STEPS }, (_, index) => (
              <i key={index} className={index < step ? "steps__done" : undefined} />
            ))}
          </span>
          <span className="welcome__count">{t("welcome.step", { step, total: STEPS })}</span>
        </header>
        <div className="welcome__body" aria-busy={session.planning || undefined}>{body}</div>
        {action && <div className="screen__actions">{action}</div>}
      </main>
    </div>
  );
}

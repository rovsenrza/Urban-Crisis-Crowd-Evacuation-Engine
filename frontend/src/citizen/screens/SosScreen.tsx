import { useEffect, useState } from "react";
import { CRITICAL_PRIORITY } from "../../api/types";
import { t } from "../../i18n";
import { formatTime } from "../../lib/format";
import { TopBar } from "../../shell/parts";
import { Badge, Banner, Button, ButtonLink, hazardIcon, Icon } from "../../ui";
import { LocationSheet } from "../LocationSheet";
import { SOS_UNDO_MS, useCitizen } from "../session";

const hazardLabel = (code: string, fallback?: string) => t(`hazard.${code}`, undefined, fallback ?? code);

/** Seconds left in the undo window, refreshed a few times a second. */
function useCountdown(sendAt: number | undefined): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (sendAt === undefined) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(timer);
  }, [sendAt]);
  return sendAt === undefined ? 0 : Math.max(0, Math.ceil((sendAt - now) / 1000));
}

/**
 * `/app/sos`: call for help and see what happened.
 *
 * Two deliberate taps send an SOS: the SOS action opens this screen, a
 * hazard button sends. A 5-second undo window runs before the signal leaves
 * the device (the server has no way to withdraw one).
 */
export function SosScreen() {
  const session = useCitizen();
  const { sos, pendingSos, sosBusy, sosResult, safe, priority, plan } = session;
  const [choosing, setChoosing] = useState(false);
  const seconds = useCountdown(pendingSos?.sendAt);

  let body;
  if (sos) {
    const isPriority = sos.priority === CRITICAL_PRIORITY;
    body = (
      <>
        <div className={`status-card${isPriority ? " status-card--priority" : " status-card--sent"}`} role="status">
          <Icon name="check" size="xl" />
          <h2>{t(isPriority ? "citizen.sosPrioritySent" : "citizen.sosSent")}</h2>
          {isPriority && <Badge tone="priority" solid icon="accessible">{t("citizen.role.badge")}</Badge>}
          <p>{t("citizen.sosSentDetail", { hazard: hazardLabel(sos.hazard_type), time: formatTime(sos.created_at) })}</p>
          <p>{t("sos.notified")}</p>
        </div>
        {sosResult === "duplicate" && <Banner tone="info">{t("citizen.sosDuplicate")}</Banner>}
        <div className="screen__actions">
          {plan?.reachable && (
            <ButtonLink to="/app/map" variant="primary" size="lg" icon="route" block>{t("sos.showRoute")}</ButtonLink>
          )}
          <Button size="lg" icon="check" block busy={session.safeBusy} onClick={() => void session.markSafe()}>
            {t("citizen.imSafe")}
          </Button>
        </div>
      </>
    );
  } else if (pendingSos || sosBusy) {
    body = (
      <>
        <div className="status-card status-card--pending" role="status" aria-live="polite">
          {pendingSos ? <span className="countdown" aria-hidden>{seconds}</span> : <span className="ui-spinner" aria-hidden />}
          <h2>
            {pendingSos
              ? t("sos.pendingTitle", { hazard: hazardLabel(pendingSos.hazard), seconds })
              : t("citizen.sosSending")}
          </h2>
          {pendingSos && (
            <span className="countdown-bar" aria-hidden>
              <i style={{ animationDuration: `${SOS_UNDO_MS}ms` }} />
            </span>
          )}
        </div>
        {pendingSos && (
          <div className="screen__actions">
            <Button variant="danger" size="lg" icon="sos" block onClick={session.sendSosNow}>{t("sos.sendNow")}</Button>
            <Button size="lg" icon="undo" block onClick={session.undoSos}>{t("sos.undo")}</Button>
          </div>
        )}
      </>
    );
  } else if (safe) {
    body = (
      <>
        <div className="status-card status-card--safe" role="status">
          <Icon name="check" size="xl" />
          <h2>{t("citizen.safeTitle")}</h2>
          <p>{t("citizen.safeDetail")}</p>
        </div>
        <div className="screen__actions">
          <ButtonLink to="/app/map" variant="primary" size="lg" icon="map" block>{t("sos.backToMap")}</ButtonLink>
          <Button size="lg" icon="sos" block onClick={session.clearSafe}>{t("citizen.needHelpAgain")}</Button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div>
          <h2 className="route-title">{t("citizen.hazardQuestion")}</h2>
          <p className="muted">{t(priority ? "sos.chooserPriority" : "sos.chooserText")}</p>
        </div>
        {sosResult === "needPosition" && (
          <Banner
            tone="danger"
            live="alert"
            actions={<Button icon="pin" onClick={() => setChoosing(true)}>{t("points.setPosition")}</Button>}
          >
            {t("citizen.pickLocationFirst")}
          </Banner>
        )}
        <div className="hazards">
          {(session.meta?.hazards ?? []).map((hazard) => (
            <button key={hazard.code} type="button" className="hazard" onClick={() => session.startSos(hazard.code)}>
              <Icon name={hazardIcon(hazard.code)} size="xl" />
              <span>{hazardLabel(hazard.code, hazard.label)}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="screen">
      <TopBar title={t("citizen.sos")} trailing={priority ? <Badge tone="priority" icon="accessible">{t("citizen.role.badge")}</Badge> : undefined} />
      <div className="screen__body screen__body--fill">{body}</div>
      <LocationSheet open={choosing} onClose={() => setChoosing(false)} />
    </div>
  );
}

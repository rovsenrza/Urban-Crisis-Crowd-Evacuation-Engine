import { useNavigate, useParams } from "react-router-dom";
import type { Alert } from "../../api/types";
import { t } from "../../i18n";
import { formatTime } from "../../lib/format";
import { Badge, Button, ButtonLink, EmptyState, IconButton, List, ListRow } from "../../ui";
import { AlertActions } from "../AlertActions";
import { decisionLines, describeAlert, hazardLabel, ruleLabel } from "../describe";
import { ScreenHeader } from "../OperatorShell";
import { useOperator } from "../session";

function StatusBadge({ alert }: { alert: Alert }) {
  if (alert.status === "open") return <Badge tone="danger" solid icon="alert">{t("alert.status.open")}</Badge>;
  if (alert.status === "confirmed") return <Badge tone="ok" icon="check">{t("alert.status.confirmed")}</Badge>;
  return <Badge>{t("alert.status.dismissed")}</Badge>;
}

function AlertDetail({ alert }: { alert: Alert }) {
  const { state, meta, showOnMap } = useOperator();
  const navigate = useNavigate();
  const hazards: string[] = alert.payload.hazard_types ?? [];
  return (
    <article className="card alert-detail">
      <header className="detail__header">
        <IconButton className="alert-detail__back" icon="chevronLeft" label={t("app.back")} onClick={() => navigate("/operator/alerts")} />
        <h2>№{alert.id} · {ruleLabel(alert)}</h2>
        <StatusBadge alert={alert} />
      </header>
      <p className="alert-detail__what">{describeAlert(alert, state.zones, meta!)}</p>
      <dl className="facts">
        <div>
          <dt>{t("alert.raised")}</dt>
          <dd>{formatTime(alert.created_at)}</dd>
        </div>
        {hazards.length > 0 && (
          <div>
            <dt>{t("alert.hazardTypes")}</dt>
            <dd>{hazards.map((h) => hazardLabel(h)).join(", ")}</dd>
          </div>
        )}
        {alert.resolved_at && (
          <div>
            <dt>{t(alert.status === "confirmed" ? "alert.confirmedAt" : "alert.dismissedAt")}</dt>
            <dd>{formatTime(alert.resolved_at)}{alert.resolved_by ? ` · ${alert.resolved_by}` : ""}</dd>
          </div>
        )}
        {alert.dismiss_reason && (
          <div>
            <dt>{t("alert.dismissReason")}</dt>
            <dd>{alert.dismiss_reason}</dd>
          </div>
        )}
      </dl>

      {alert.status === "open" && (
        <>
          <p className="alert-detail__plan">{t("alert.action")}</p>
          <AlertActions key={alert.id} alert={alert} />
        </>
      )}
      {alert.status === "confirmed" && (
        <section>
          <h3>{t("alert.executed")}</h3>
          <ul className="bullets">
            {decisionLines(alert.actions).map((line) => <li key={line}>{line}</li>)}
          </ul>
        </section>
      )}
      <Button
        icon="map"
        onClick={() => {
          showOnMap(null, [alert.lat, alert.lng]);
          navigate("/operator/live");
        }}
      >
        {t("operator.showOnMap")}
      </Button>
    </article>
  );
}

/** `/operator/alerts` and `/operator/alerts/:id`: open and past alerts, confirm and dismiss. */
export function Alerts() {
  const { id } = useParams();
  const { state, pastAlerts, meta } = useOperator();
  const all = [...state.alerts, ...pastAlerts];
  const current = id ? all.find((a) => String(a.id) === id) : undefined;

  const row = (alert: Alert) => (
    <li key={alert.id}>
      <ListRow
        to={`/operator/alerts/${alert.id}`}
        icon={alert.status === "open" ? "alert" : alert.status === "confirmed" ? "check" : "close"}
        tone={alert.status === "open" ? "danger" : "neutral"}
        title={`№${alert.id} · ${ruleLabel(alert)}`}
        subtitle={describeAlert(alert, state.zones, meta!)}
        selected={current?.id === alert.id}
        trailing={
          <>
            <StatusBadge alert={alert} />
            <time>{formatTime(alert.created_at)}</time>
          </>
        }
      />
    </li>
  );

  return (
    <div className="page split" data-detail={id ? "open" : "closed"}>
      <div className="split__list">
        <ScreenHeader title={t("alert.open")} count={state.alerts.length} />
        {state.alerts.length === 0 ? (
          <p className="muted card card--quiet">{t("alert.none")}</p>
        ) : (
          <div className="card card--flush"><List label={t("alert.open")}>{state.alerts.map(row)}</List></div>
        )}
        <ScreenHeader title={t("alert.past")} count={pastAlerts.length} />
        {pastAlerts.length === 0 ? (
          <p className="muted card card--quiet">{t("alert.pastEmpty")}</p>
        ) : (
          <div className="card card--flush"><List label={t("alert.past")}>{pastAlerts.map(row)}</List></div>
        )}
      </div>
      <div className="split__detail">
        {current ? (
          <AlertDetail alert={current} />
        ) : id ? (
          <EmptyState
            icon="bell"
            title={t("alert.missingTitle")}
            action={<ButtonLink to="/operator/alerts" variant="primary" icon="list">{t("alert.backToList")}</ButtonLink>}
          >
            {t("alert.missingText")}
          </EmptyState>
        ) : (
          <EmptyState icon="bell" title={t("alert.pickTitle")}>{t("alert.pickText")}</EmptyState>
        )}
      </div>
    </div>
  );
}

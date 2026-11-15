import { useState } from "react";
import { Link } from "react-router-dom";
import { t } from "../../i18n";
import { formatTime } from "../../lib/format";
import { brigadeName, pointName } from "../../lib/labels";
import { Button, EmptyState } from "../../ui";
import { ScreenHeader } from "../OperatorShell";
import { useOperator } from "../session";

/** `/operator/audit`: every decision, who took it and what it did. */
export function Audit() {
  const { state, refreshAudit } = useOperator();
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    await refreshAudit();
    setBusy(false);
  };

  return (
    <div className="page page--narrow">
      <ScreenHeader title={t("operator.audit")} count={state.audit.length}>
        <Button icon="reset" busy={busy} onClick={() => void refresh()}>{t("audit.refresh")}</Button>
      </ScreenHeader>
      {state.audit.length === 0 ? (
        <div className="card"><EmptyState icon="clipboard" title={t("operator.auditEmpty")}>{t("audit.emptyText")}</EmptyState></div>
      ) : (
        <div className="card card--flush">
          <ul className="audit ui-list">
            {state.audit.map((entry) => {
              const d = entry.details;
              const title = t(`audit.${entry.action}`, { id: entry.alert_id, notified: d.notified, changed: d.route_changed }, entry.action);
              return (
                <li key={entry.id} className="audit__item">
                  <time>{formatTime(entry.created_at)}</time>
                  <div>
                    <strong>
                      {entry.alert_id ? <Link to={`/operator/alerts/${entry.alert_id}`}>{title}</Link> : title}
                    </strong>
                    <p className="muted">
                      {[
                        entry.actor,
                        d.brigade_name && t("audit.brigade", { name: brigadeName(d.brigade_name) }),
                        d.activated_point_name && t("audit.point", { name: pointName(d.activated_point_name) }),
                        d.reason && t("audit.reason", { reason: d.reason }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

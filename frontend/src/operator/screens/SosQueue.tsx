import { useNavigate } from "react-router-dom";
import { CRITICAL_PRIORITY } from "../../api/types";
import { t } from "../../i18n";
import { formatTime } from "../../lib/format";
import { Badge, EmptyState, hazardIcon, Icon, List, ListRow } from "../../ui";
import { hazardLabel, zoneNameOf } from "../describe";
import { ScreenHeader } from "../OperatorShell";
import { useOperator } from "../session";

const MAX_ROWS = 100;

/**
 * `/operator/sos`: the SOS queue, Priority #1 first.
 *
 * Read-only by design: the backend cannot resolve a single SOS or send a
 * brigade to one, so the only action is "show on the map".
 */
export function SosQueue() {
  const { state, meta, showOnMap } = useOperator();
  const navigate = useNavigate();
  const hazards = meta!.hazards;
  // A flood of signals must not freeze the console: the list draws the first
  // rows (Priority #1 is sorted first), the counts stay exact.
  const visible = state.sos.slice(0, MAX_ROWS);

  const districts = state.zones
    .map((zone) => ({ zone, signals: state.sos.filter((s) => s.zone_id === zone.id) }))
    .sort((a, b) => b.signals.length - a.signals.length || a.zone.name.localeCompare(b.zone.name, "az"));
  const max = Math.max(1, ...districts.map((d) => d.signals.length));

  return (
    <div className="page columns">
      <section>
        <ScreenHeader title={t("sosQueue.title")} count={state.sos.length} />
        {state.sos.length === 0 ? (
          <div className="card"><EmptyState icon="check" title={t("operator.noSos")}>{t("sosQueue.emptyText")}</EmptyState></div>
        ) : (
          <div className="card card--flush">
            <List label={t("sosQueue.title")}>
              {visible.map((sos) => {
                const priority = sos.priority === CRITICAL_PRIORITY;
                return (
                  <li key={sos.id}>
                    <ListRow
                      icon={priority ? "accessible" : hazardIcon(sos.hazard_type)}
                      tone={priority ? "priority" : "neutral"}
                      title={`№${sos.id} · ${zoneNameOf(state.zones, sos.zone_id)} · ${hazardLabel(sos.hazard_type)}`}
                      subtitle={priority ? t("operator.priorityCitizen") : undefined}
                      trailing={
                        <>
                          {priority && <Badge tone="priority" solid>{t("sosQueue.priority")}</Badge>}
                          <time>{formatTime(sos.created_at)}</time>
                          <Icon name="map" size="sm" label={t("operator.showOnMap")} />
                        </>
                      }
                      onPress={() => {
                        showOnMap({ kind: "sos", id: sos.id }, [sos.lat, sos.lng]);
                        navigate("/operator/live");
                      }}
                    />
                  </li>
                );
              })}
            </List>
          </div>
        )}
        {state.sos.length > visible.length && (
          <p className="hint" role="status">{t("sosQueue.shown", { shown: visible.length, total: state.sos.length })}</p>
        )}
      </section>

      <section>
        <ScreenHeader title={t("operator.sosByZone")} />
        <div className="card">
          <ul className="districts">
            {districts.map(({ zone, signals }) => (
              <li key={zone.id} className={signals.length ? undefined : "districts__quiet"}>
                <span className="districts__name">{zone.name}</span>
                <span className="districts__bar" aria-hidden>
                  {/* One segment per hazard type, coloured like the map markers. */}
                  {hazards.map((hazard) => {
                    const count = signals.filter((s) => s.hazard_type === hazard.code).length;
                    return count ? (
                      <i key={hazard.code} className={`mk-hazard--${hazard.code}`} style={{ width: `${(count / max) * 100}%` }} />
                    ) : null;
                  })}
                </span>
                <b>{signals.length}</b>
                {signals.length > 0 && (
                  <span className="districts__breakdown">
                    {hazards
                      .map((hazard) => ({ hazard, count: signals.filter((s) => s.hazard_type === hazard.code).length }))
                      .filter(({ count }) => count > 0)
                      .map(({ hazard, count }) => `${hazardLabel(hazard.code, hazard.label)} ${count}`)
                      .join(" · ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <ul className="swatches">
            {hazards.map((hazard) => (
              <li key={hazard.code}>
                <span className={`mk mk-sos mk-hazard--${hazard.code}`}><Icon name={hazardIcon(hazard.code)} size="sm" /></span>
                {hazardLabel(hazard.code, hazard.label)}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

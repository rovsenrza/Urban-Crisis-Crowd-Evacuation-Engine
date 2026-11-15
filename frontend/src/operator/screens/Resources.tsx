import { useNavigate } from "react-router-dom";
import type { BrigadeStatus } from "../../api/types";
import { occupancyText } from "../../citizen/labels";
import { t } from "../../i18n";
import { formatEta, formatNumber, occupancyLevel } from "../../lib/format";
import { brigadeName, pointName } from "../../lib/labels";
import { Badge, IconButton, kindIcon, List, ListRow, Meter, Select } from "../../ui";
import { ScreenHeader } from "../OperatorShell";
import { useOperator } from "../session";
import { BRIGADE_STATUSES } from "./Live";

/** `/operator/resources`: assembly points with occupancy, and brigades with their status. */
export function Resources() {
  const { state, meta, setBrigadeStatus, showOnMap, can } = useOperator();
  const navigate = useNavigate();
  const thresholds = meta!.thresholds;
  const marks = [thresholds.reroute_occupancy_pct, thresholds.critical_occupancy_pct];
  const points = [...state.points].sort((a, b) => Number(b.is_active) - Number(a.is_active) || b.occupancy_pct - a.occupancy_pct);

  return (
    <div className="page columns">
      <section>
        <ScreenHeader title={t("operator.assembly")} count={points.filter((p) => p.is_active).length} />
        <div className="card card--flush">
          <List label={t("operator.assembly")}>
            {points.map((point) => {
              const level = occupancyLevel(point.occupancy_pct, thresholds);
              return (
                <li key={point.id}>
                  <ListRow
                    icon={kindIcon(point.kind)}
                    title={pointName(point.name)}
                    subtitle={
                      point.is_active
                        ? `${t(`kind.${point.kind}`)} · ${formatNumber(point.occupancy)} / ${formatNumber(point.capacity)}`
                        : `${t(`kind.${point.kind}`)} · ${t("resources.capacity")} ${formatNumber(point.capacity)}`
                    }
                    trailing={
                      <>
                        {point.is_accessible && <Badge tone="priority" icon="accessible">{t("operator.accessible")}</Badge>}
                        {point.is_reserve && <Badge>{t("operator.reserve")}</Badge>}
                        {!point.is_active && <Badge tone="warn">{t("operator.inactive")}</Badge>}
                      </>
                    }
                    onPress={() => {
                      showOnMap({ kind: "point", id: point.id }, [point.lat, point.lng]);
                      navigate("/operator/live");
                    }}
                  >
                    {point.is_active && (
                      <Meter
                        pct={point.occupancy_pct}
                        level={level}
                        label={t("sim.occupancy")}
                        valueText={occupancyText(point.occupancy_pct, level)}
                        marks={marks}
                      />
                    )}
                  </ListRow>
                </li>
              );
            })}
          </List>
        </div>
        <p className="hint">{t("resources.marksHint", { reroute: marks[0], critical: marks[1] })}</p>
      </section>

      <section>
        <ScreenHeader title={t("operator.brigades")} count={state.brigades.length} />
        <div className="card card--flush">
          <List label={t("operator.brigades")}>
            {state.brigades.map((brigade) => (
              <li key={brigade.id}>
                <ListRow
                  icon="truck"
                  title={brigadeName(brigade.name)}
                  subtitle={
                    [
                      brigade.target_alert_id ? t("operator.target", { id: brigade.target_alert_id }) : "",
                      brigade.status === "en_route" && brigade.eta_s !== null ? t("operator.eta", { value: formatEta(brigade.eta_s) }) : "",
                    ]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                  trailing={
                    <>
                      {can("decide") ? (
                        <Select
                          value={brigade.status}
                          aria-label={`${brigadeName(brigade.name)}: ${t("resources.status")}`}
                          onChange={(e) => void setBrigadeStatus(brigade.id, e.target.value as BrigadeStatus)}
                        >
                          {BRIGADE_STATUSES.map((status) => (
                            <option key={status} value={status}>{t(`brigadeStatus.${status}`)}</option>
                          ))}
                        </Select>
                      ) : (
                        <Badge>{t(`brigadeStatus.${brigade.status}`)}</Badge>
                      )}
                      <IconButton
                        icon="map"
                        label={`${brigadeName(brigade.name)}: ${t("operator.showOnMap")}`}
                        onClick={() => {
                          showOnMap({ kind: "brigade", id: brigade.id }, [brigade.lat, brigade.lng]);
                          navigate("/operator/live");
                        }}
                      />
                    </>
                  }
                />
              </li>
            ))}
          </List>
        </div>
      </section>
    </div>
  );
}

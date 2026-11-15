import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { PRIORITY_ROLE } from "../../api/types";
import { t } from "../../i18n";
import { pointName } from "../../lib/labels";
import { Button, EmptyState, Field, Select, Switch, TextInput } from "../../ui";
import { hazardLabel } from "../describe";
import { ScreenHeader } from "../OperatorShell";
import { useOperator } from "../session";
import { scenarioText } from "../state";

const SCENARIO = "earthquake";
const RESET_ARM_MS = 4000;
const clampCount = (value: string) => Math.max(1, Math.min(20, Number(value) || 1));

/** `/operator/simulation`: demo tooling, kept off the working screens. Exists only when the server enables it. */
export function Simulation() {
  const { state, meta, run, can } = useOperator();
  const [zoneId, setZoneId] = useState("");
  const [count, setCount] = useState(4);
  const [hazard, setHazard] = useState("");
  const [priority, setPriority] = useState(false);
  const [pointId, setPointId] = useState(0);
  const [roadCount, setRoadCount] = useState(3);
  const [resetArmed, setResetArmed] = useState(false);

  useEffect(() => {
    if (!resetArmed) return;
    const timer = setTimeout(() => setResetArmed(false), RESET_ARM_MS);
    return () => clearTimeout(timer);
  }, [resetArmed]);

  if (!meta?.sim_enabled) {
    return (
      <div className="page page--narrow">
        <EmptyState icon="flask" title={t("errors.code.simulation_disabled")}>{t("sim.disabledText")}</EmptyState>
      </div>
    );
  }
  // The simulator changes live data, so the server only lets the admin role use it.
  if (!can("simulate")) {
    return (
      <div className="page page--narrow">
        <EmptyState icon="lock" title={t("errors.code.forbidden")}>{t("role.readOnly")}</EmptyState>
      </div>
    );
  }

  const activePoints = state.points.filter((p) => p.is_active);
  const zone = zoneId || state.zones[0]?.id || "";
  const point = pointId || activePoints[0]?.id || 0;
  const scenario = state.scenario;
  const running = Boolean(scenario?.running);

  const reset = () => {
    // Two presses instead of a blocking confirm dialog.
    if (!resetArmed) return setResetArmed(true);
    setResetArmed(false);
    void run((token) => api.sim.reset(token));
  };

  return (
    <div className="page page--narrow">
      <ScreenHeader title={t("sim.title")} />

      <section className="card sim">
        <div className="sim__head">
          <div>
            <h2>{t("sim.scenario")}</h2>
            <p className="muted">{t("sim.scenarioHint")}</p>
          </div>
          {running ? (
            <Button icon="stop" onClick={() => void run((token) => api.sim.stopScenario(token))}>{t("sim.stop")}</Button>
          ) : (
            <Button variant="primary" icon="play" onClick={() => void run((token) => api.sim.startScenario(token, SCENARIO))}>{t("sim.start")}</Button>
          )}
        </div>
        {scenario && scenario.total > 0 && (
          <div role="status">
            <div
              className="progress"
              role="progressbar"
              aria-label={t("sim.scenario")}
              aria-valuemin={0}
              aria-valuemax={scenario.total}
              aria-valuenow={scenario.step}
            >
              <i style={{ width: `${(scenario.step / scenario.total) * 100}%` }} />
            </div>
            <p>
              <strong>{t("sim.step", { step: scenario.step, total: scenario.total })}</strong>{" "}
              {scenario.step > 0 ? scenarioText(scenario) : ""}
            </p>
          </div>
        )}
      </section>

      <section className="card sim">
        <h2>{t("sim.sos")}</h2>
        <div className="sim__grid">
          <Field label={t("sim.zone")}>
            {(props) => (
              <Select {...props} value={zone} onChange={(e) => setZoneId(e.target.value)}>
                {state.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t("sim.hazard")}>
            {(props) => (
              <Select {...props} value={hazard} onChange={(e) => setHazard(e.target.value)}>
                <option value="">{t("sim.anyHazard")}</option>
                {meta.hazards.map((h) => <option key={h.code} value={h.code}>{hazardLabel(h.code, h.label)}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t("sim.count")}>
            {(props) => (
              <TextInput {...props} type="number" inputMode="numeric" min={1} max={20} value={count} onChange={(e) => setCount(clampCount(e.target.value))} />
            )}
          </Field>
        </div>
        <Switch checked={priority} onChange={setPriority} label={t("sim.priority")} icon="accessible" tone="priority" />
        <Button
          variant="primary"
          icon="plus"
          onClick={() => void run((token) => api.sim.sos(token, zone, count, hazard, priority ? PRIORITY_ROLE : undefined))}
        >
          {t("sim.generate")}
        </Button>
      </section>

      <section className="card sim">
        <h2>{t("sim.occupancy")}</h2>
        <Field label={t("sim.point")}>
          {(props) => (
            <Select {...props} value={point} onChange={(e) => setPointId(Number(e.target.value))}>
              {activePoints.map((p) => (
                <option key={p.id} value={p.id}>{pointName(p.name)} ({Math.round(p.occupancy_pct)}%)</option>
              ))}
            </Select>
          )}
        </Field>
        <div className="sim__buttons">
          {[5, 10].map((delta) => (
            <Button key={delta} onClick={() => void run((token) => api.sim.occupancy(token, point, { delta_pct: delta }))}>
              {t("sim.plus", { value: delta })}
            </Button>
          ))}
          {[91, 96].map((value) => (
            <Button key={value} onClick={() => void run((token) => api.sim.occupancy(token, point, { occupancy_pct: value }))}>
              {t("sim.setTo", { value })}
            </Button>
          ))}
        </div>
      </section>

      <section className="card sim">
        <h2>{t("sim.roads")}</h2>
        <div className="sim__grid">
          <Field label={t("sim.count")}>
            {(props) => (
              <TextInput {...props} type="number" inputMode="numeric" min={1} max={20} value={roadCount} onChange={(e) => setRoadCount(clampCount(e.target.value))} />
            )}
          </Field>
        </div>
        <div className="sim__buttons">
          <Button onClick={() => void run((token) => api.sim.randomRoads(token, "close", roadCount))}>{t("sim.closeRandom")}</Button>
          <Button onClick={() => void run((token) => api.sim.openAllRoads(token))}>{t("sim.openAll")}</Button>
        </div>
        <p className="hint">{t("sim.roadsHint")}</p>
      </section>

      <section className="card sim">
        <h2>{t("sim.reset")}</h2>
        <p className="muted">{t("sim.resetText")}</p>
        <Button variant={resetArmed ? "danger" : "secondary"} icon="reset" onClick={reset}>
          {t(resetArmed ? "sim.resetConfirm" : "sim.reset")}
        </Button>
      </section>
    </div>
  );
}

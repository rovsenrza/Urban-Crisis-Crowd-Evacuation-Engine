import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CRITICAL_PRIORITY, type BrigadeStatus, type Meta } from "../../api/types";
import { t } from "../../i18n";
import { formatDistance, formatEta, formatNumber, formatTime, occupancyLevel } from "../../lib/format";
import { nearestEdge } from "../../lib/geo";
import { brigadeName, pointName, roadName } from "../../lib/labels";
import { MapView } from "../../map/MapView";
import { Badge, Button, DockedSheet, hazardIcon, Icon, IconButton, kindIcon, Meter, Select } from "../../ui";
import { occupancyText } from "../../citizen/labels";
import { hazardLabel, zoneNameOf } from "../describe";
import { closedRoads, operatorScene } from "../scene";
import { useOperator } from "../session";
import type { DashboardState } from "../state";

export const BRIGADE_STATUSES: BrigadeStatus[] = ["available", "en_route", "on_site", "returning"];

function StatusStrip({ state }: { state: DashboardState }) {
  const priority = state.sos.filter((s) => s.priority === CRITICAL_PRIORITY).length;
  const stats: [string, number, string][] = [
    ["operator.stats.openSos", state.sos.length, ""],
    ["operator.stats.prioritySos", priority, priority ? "priority" : ""],
    ["operator.stats.alerts", state.alerts.length, state.alerts.length ? "danger" : ""],
    ["operator.stats.closedRoads", state.roads.edges.filter((e) => !e.is_open).length, ""],
    ["operator.stats.brigadesFree", state.brigades.filter((b) => b.status === "available").length, ""],
    ["operator.stats.safe", state.safeCitizens, ""],
  ];
  return (
    <dl className="strip">
      {stats.map(([key, value, tone]) => (
        <div key={key} className={tone ? `strip__item strip__item--${tone}` : "strip__item"}>
          <dd>{value}</dd>
          <dt>{t(key)}</dt>
        </div>
      ))}
    </dl>
  );
}

function Legend({ meta }: { meta: Meta }) {
  return (
    <details className="legend">
      <summary>{t("operator.legend")}</summary>
      <ul>
        {meta.hazards.map((hazard) => (
          <li key={hazard.code}>
            <span className={`mk mk-sos mk-hazard--${hazard.code}`}><Icon name={hazardIcon(hazard.code)} size="sm" /></span>
            SOS: {hazardLabel(hazard.code, hazard.label)}
          </li>
        ))}
        <li><span className="legend__swatch legend__swatch--priority" />{t("operator.prioritySos")}</li>
        <li><span className="legend__swatch legend__swatch--closed" />{t("operator.legendClosed")}</li>
        <li><span className="legend__swatch legend__swatch--route" />{t("operator.legendRoute")}</li>
        <li><span className="legend__swatch legend__swatch--alert" />{t("operator.legendCluster")}</li>
      </ul>
    </details>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** What a tooltip used to show, as a panel reachable by tap, with the actions for the selected thing. */
function Detail({ meta }: { meta: Meta }) {
  const { state, selection, select, setRoadOpen, setBrigadeStatus, can } = useOperator();
  const [busy, setBusy] = useState(false);
  if (!selection) return null;
  const close = <IconButton icon="close" label={t("app.close")} onClick={() => select(null)} />;

  if (selection.kind === "road") {
    const edge = state.roads.edges.find((e) => e.id === selection.id);
    if (!edge) return null;
    const toggle = async () => {
      setBusy(true);
      await setRoadOpen(edge.id, !edge.is_open);
      setBusy(false);
    };
    return (
      <>
        <header className="detail__header">
          <Icon name="road" />
          <h2>{roadName(edge.id, edge.name)}</h2>
          {close}
        </header>
        <div className="badges">
          <Badge tone={edge.is_open ? "ok" : "danger"} solid={!edge.is_open}>{t(edge.is_open ? "road.open" : "road.closed")}</Badge>
          {!edge.is_accessible && <Badge tone="warn" icon="accessible">{t("operator.barrier")}</Badge>}
        </div>
        <dl className="facts">
          <Fact label={t("road.length")}>{formatDistance(edge.length_m)}</Fact>
        </dl>
        {/* Road closures go through the simulator API, which needs the admin role; otherwise there is no real action to offer. */}
        {meta.sim_enabled && can("simulate") && (
          <Button variant={edge.is_open ? "danger" : "primary"} icon={edge.is_open ? "close" : "check"} block busy={busy} onClick={() => void toggle()}>
            {t(edge.is_open ? "road.close" : "road.reopen")}
          </Button>
        )}
      </>
    );
  }

  if (selection.kind === "sos") {
    const sos = state.sos.find((s) => s.id === selection.id);
    if (!sos) return null;
    const priority = sos.priority === CRITICAL_PRIORITY;
    return (
      <>
        <header className="detail__header">
          <Icon name={priority ? "accessible" : hazardIcon(sos.hazard_type)} />
          <h2>SOS №{sos.id}</h2>
          {close}
        </header>
        {priority && (
          <div className="badges"><Badge tone="priority" solid icon="accessible">{t("operator.prioritySos")}</Badge></div>
        )}
        <dl className="facts">
          <Fact label={t("sosQueue.hazard")}>{hazardLabel(sos.hazard_type)}</Fact>
          <Fact label={t("sim.zone")}>{zoneNameOf(state.zones, sos.zone_id)}</Fact>
          <Fact label={t("sosQueue.received")}>{formatTime(sos.created_at)}</Fact>
          {priority && <Fact label={t("sosQueue.citizen")}>{t("operator.priorityCitizen")}</Fact>}
        </dl>
      </>
    );
  }

  if (selection.kind === "point") {
    const point = state.points.find((p) => p.id === selection.id);
    if (!point) return null;
    const level = occupancyLevel(point.occupancy_pct, meta.thresholds);
    return (
      <>
        <header className="detail__header">
          <Icon name={kindIcon(point.kind)} />
          <h2>{pointName(point.name)}</h2>
          {close}
        </header>
        <div className="badges">
          <Badge>{t(`kind.${point.kind}`)}</Badge>
          {point.is_reserve && <Badge>{t("operator.reserve")}</Badge>}
          {!point.is_active && <Badge tone="warn">{t("operator.inactive")}</Badge>}
          {point.is_accessible && <Badge tone="priority" icon="accessible">{t("operator.accessible")}</Badge>}
        </div>
        {point.is_active && (
          <Meter
            pct={point.occupancy_pct}
            level={level}
            label={t("sim.occupancy")}
            valueText={occupancyText(point.occupancy_pct, level)}
            marks={[meta.thresholds.reroute_occupancy_pct, meta.thresholds.critical_occupancy_pct]}
            size="lg"
          />
        )}
        <dl className="facts">
          {point.is_active && <Fact label={t("resources.inside")}>{formatNumber(point.occupancy)}</Fact>}
          <Fact label={t("resources.capacity")}>{formatNumber(point.capacity)}</Fact>
        </dl>
      </>
    );
  }

  const brigade = state.brigades.find((b) => b.id === selection.id);
  if (!brigade) return null;
  return (
    <>
      <header className="detail__header">
        <Icon name="truck" />
        <h2>{brigadeName(brigade.name)}</h2>
        {close}
      </header>
      <dl className="facts">
        {brigade.target_alert_id && (
          <Fact label={t("resources.target")}>
            <Link to={`/operator/alerts/${brigade.target_alert_id}`}>{t("operator.target", { id: brigade.target_alert_id })}</Link>
          </Fact>
        )}
        {brigade.status === "en_route" && brigade.eta_s !== null && (
          <Fact label={t("resources.eta")}>{formatEta(brigade.eta_s)}</Fact>
        )}
      </dl>
      {can("decide") ? (
        <label className="detail__status">
          <span>{t("resources.status")}</span>
          <Select value={brigade.status} onChange={(e) => void setBrigadeStatus(brigade.id, e.target.value as BrigadeStatus)}>
            {BRIGADE_STATUSES.map((status) => (
              <option key={status} value={status}>{t(`brigadeStatus.${status}`)}</option>
            ))}
          </Select>
        </label>
      ) : (
        <dl className="facts">
          <Fact label={t("resources.status")}>{t(`brigadeStatus.${brigade.status}`)}</Fact>
        </dl>
      )}
    </>
  );
}

export function Feed({ state }: { state: DashboardState }) {
  if (state.feed.length === 0) return <p className="muted">{t("operator.feedEmpty")}</p>;
  return (
    <ul className="feed">
      {state.feed.map((item) => (
        <li key={item.id} className={`feed__item feed__item--${item.tone}`}>
          <time>{formatTime(item.ts)}</time>
          <span>{item.render()}</span>
        </li>
      ))}
    </ul>
  );
}

/** `/operator/live`: the home screen. Live map, a compact status strip, and a panel for the selection or the event feed. */
export function Live() {
  const session = useOperator();
  const { state, selection, select, focus } = session;
  const meta = session.meta!;
  const [feedOpen, setFeedOpen] = useState(false);
  const [tilesFailing, setTilesFailing] = useState(false);

  const closed = useMemo(() => closedRoads(state.roads.edges), [state.roads]);
  const scene = useMemo(() => operatorScene(state, meta, closed, selection, focus), [state, meta, closed, selection, focus]);

  const onPress = (lat: number, lng: number, toleranceM: number) => {
    const edge = nearestEdge(state.roads.edges, lat, lng, toleranceM);
    select(edge ? { kind: "road", id: edge.id } : null);
  };

  const panelOpen = Boolean(selection) || feedOpen;
  return (
    <div className="live">
      <div className="live__top">
        <StatusStrip state={state} />
        <Button className="live__feed-toggle" icon="list" aria-label={t("operator.feed")} aria-pressed={feedOpen} onClick={() => { select(null); setFeedOpen((open) => !open); }}>
          {t("operator.feed")}
        </Button>
      </div>
      {tilesFailing && (
        <p className="console__offline" role="status">
          <Icon name="offline" size="sm" />
          {t("map.tilesFailingOperator")}
        </p>
      )}
      <div className="live__body" data-panel={panelOpen ? "open" : "closed"}>
        <div className="live__map">
          <MapView scene={scene} center={meta.map.center} zoom={meta.map.zoom} label={t("operator.mapLabel")} zoomControl onPress={onPress} onSelect={select} onTilesFailing={setTilesFailing} />
          <Legend meta={meta} />
        </div>
        <DockedSheet placement="side" label={selection ? t("operator.detailLabel") : t("operator.feed")}>
          <div className="detail">
            {selection ? (
              <Detail meta={meta} />
            ) : (
              <>
                <header className="detail__header">
                  <Icon name="list" />
                  <h2>{t("operator.feed")}</h2>
                  <IconButton className="live__feed-close" icon="close" label={t("app.close")} onClick={() => setFeedOpen(false)} />
                </header>
                <p className="hint">{t("operator.mapHint")}</p>
                <Feed state={state} />
              </>
            )}
          </div>
        </DockedSheet>
      </div>
    </div>
  );
}

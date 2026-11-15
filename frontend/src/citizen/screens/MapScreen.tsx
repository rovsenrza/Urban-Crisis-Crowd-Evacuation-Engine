import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "../../i18n";
import { pointName } from "../../lib/labels";
import { MapView } from "../../map/MapView";
import type { MapTarget } from "../../map/scene";
import type { Position } from "../../platform";
import { Badge, Banner, Button, ButtonLink, DockedSheet, IconButton, Meter, Skeleton } from "../../ui";
import { occupancyText, routeSummary } from "../labels";
import { LocationSheet } from "../LocationSheet";
import { citizenRoads, citizenScene } from "../scene";
import { useCitizen } from "../session";
import { useLocate } from "../useLocate";

/** `/app/map`: know where to go. Full-bleed map, the current route in a sheet at thumb height. */
export function MapScreen() {
  const session = useCitizen();
  const navigate = useNavigate();
  const { plan, selected, planning, safe, priority } = session;
  const [pending, setPending] = useState<Position | null>(null);
  const [choosing, setChoosing] = useState(false);
  const { locate, locating, errorText } = useLocate();
  const [tilesFailing, setTilesFailing] = useState(false);

  const roads = useMemo(() => citizenRoads(session.roads, priority), [session.roads, priority]);
  const scene = useMemo(
    () => citizenScene({ plan, roads: session.roads, showBarriers: priority, pending, routeVersion: session.routeVersion }, roads),
    [plan, session.roads, priority, pending, session.routeVersion, roads],
  );

  const onSelect = (target: MapTarget) => {
    if (target.kind === "point") navigate(`/app/points/${target.id}`);
  };

  const confirmPending = async () => {
    if (!pending) return;
    const position = pending;
    setPending(null);
    await session.setPosition(position);
  };

  let sheet;
  if (pending) {
    sheet = (
      <>
        <h2>{t("citizen.map.pendingTitle")}</h2>
        <p className="muted">{t("citizen.map.pendingText")}</p>
        <div className="sheet-actions">
          <Button variant="primary" size="lg" icon="pin" onClick={() => void confirmPending()}>{t("citizen.map.pendingConfirm")}</Button>
          <Button size="lg" onClick={() => setPending(null)}>{t("app.cancel")}</Button>
        </div>
      </>
    );
  } else if (planning) {
    sheet = (
      <div aria-busy>
        <h2>{t("citizen.map.planning")}</h2>
        <Skeleton lines={3} label={t("citizen.map.planning")} />
      </div>
    );
  } else if (safe) {
    sheet = (
      <>
        <Badge tone="ok" icon="check">{t("citizen.safeBadge")}</Badge>
        <h2>{t("citizen.safeTitle")}</h2>
        <p className="muted">{t("citizen.safeDetail")}</p>
        <div className="sheet-actions">
          <Button variant="primary" size="lg" icon="route" onClick={() => { session.clearSafe(); setChoosing(true); }}>
            {t("citizen.planAgain")}
          </Button>
          <ButtonLink to="/app/sos" size="lg" icon="sos" onClick={session.clearSafe}>{t("citizen.needHelpAgain")}</ButtonLink>
        </div>
      </>
    );
  } else if (!plan) {
    sheet = (
      <>
        <h2>{t("citizen.whereAreYou")}</h2>
        <p className="muted">{t("citizen.map.startText")}</p>
        {errorText && <Banner tone="danger" live="alert">{errorText}</Banner>}
        <div className="sheet-actions">
          <Button variant="primary" size="lg" icon="locate" busy={locating} onClick={() => void locate()}>
            {t(locating ? "citizen.locating" : "citizen.shareLocation")}
          </Button>
          <Button size="lg" icon="pin" onClick={() => setChoosing(true)}>{t("citizen.chooseDistrict")}</Button>
        </div>
      </>
    );
  } else if (!plan.reachable || !selected) {
    sheet = (
      <>
        <h2>{t(plan.accessible ? "citizen.noAccessibleRoute" : "citizen.noRoute")}</h2>
        <p className="muted">{t(plan.accessible ? "citizen.noAccessibleRouteHelp" : "citizen.noRouteHelp")}</p>
        <div className="sheet-actions">
          <ButtonLink to="/app/sos" variant="danger" size="lg" icon="sos">{t("citizen.sendSos")}</ButtonLink>
          <Button size="lg" icon="pin" onClick={() => setChoosing(true)}>{t("citizen.changePosition")}</Button>
        </div>
      </>
    );
  } else {
    const isRecommended = selected.point.id === plan.recommended_point_id;
    sheet = (
      <>
        <div className="badges">
          {plan.routing_mode === "fallback" && <Badge tone="warn" icon="offline">{t("routing.badge")}</Badge>}
          {plan.accessible && <Badge tone="priority" icon="accessible">{t("citizen.accessibleRoute")}</Badge>}
          {isRecommended && <Badge tone="accent">{t("citizen.recommended")}</Badge>}
        </div>
        <div>
          <p className="eyebrow">{t("citizen.map.routeTo")}</p>
          <h2 className="route-title">{pointName(selected.point.name)}</h2>
          <p className="route-summary">{routeSummary(selected)}</p>
        </div>
        <Meter
          pct={selected.point.occupancy_pct}
          level={selected.level}
          label={t("citizen.occupancy")}
          valueText={occupancyText(selected.point.occupancy_pct, selected.level)}
          size="lg"
        />
        {plan.all_full && <p className="note note--warn">{t("citizen.allFull")}</p>}
        <div className="sheet-actions">
          <ButtonLink to="/app/points" variant="primary" size="lg" icon="list">{t("citizen.map.otherPoints")}</ButtonLink>
          <Button size="lg" icon="check" busy={session.safeBusy} onClick={() => void session.markSafe()}>{t("citizen.imSafe")}</Button>
        </div>
      </>
    );
  }

  return (
    <div className="map-screen">
      <MapView
        scene={scene}
        center={session.center}
        zoom={session.zoom}
        label={t("citizen.map.label")}
        attribution="topleft"
        sheetInset
        onTilesFailing={setTilesFailing}
        onPress={(lat, lng) => setPending({ lat, lng })}
        onSelect={onSelect}
      />
      <div className="map-screen__tools">
        <IconButton variant="raised" icon="locate" label={t("citizen.shareLocation")} disabled={locating} onClick={() => void locate()} />
      </div>
      <DockedSheet label={t("citizen.map.sheetLabel")}>
        <div className="sheet-stack">
          {tilesFailing && <p className="note note--warn" role="status">{t("map.tilesFailing")}</p>}
          {sheet}
        </div>
        {plan && !pending && !planning && (
          <p className="hint">{t("citizen.mapHint")}</p>
        )}
      </DockedSheet>
      <LocationSheet open={choosing} onClose={() => setChoosing(false)} />
    </div>
  );
}

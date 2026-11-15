import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { t } from "../../i18n";
import { formatDistance, formatEta, formatNumber } from "../../lib/format";
import { pointName } from "../../lib/labels";
import { TopBar } from "../../shell/parts";
import { Badge, Banner, Button, ButtonLink, EmptyState, Icon, kindIcon, List, ListRow, Meter, SkeletonList } from "../../ui";
import { occupancyText, routeSummary } from "../labels";
import { LocationSheet } from "../LocationSheet";
import { useCitizen } from "../session";

/** `/app/points`: compare alternatives. Nearest active points, ranked by route distance. */
export function PointsScreen() {
  const { plan, planning } = useCitizen();
  const [choosing, setChoosing] = useState(false);
  const title = t(plan?.accessible ? "citizen.accessiblePoints" : "citizen.nearestPoints");

  let body;
  if (planning && !plan) {
    body = <SkeletonList rows={5} label={t("app.loading")} />;
  } else if (!plan) {
    body = (
      <EmptyState
        icon="pin"
        title={t("points.emptyTitle")}
        action={<Button variant="primary" size="lg" icon="locate" onClick={() => setChoosing(true)}>{t("points.setPosition")}</Button>}
      >
        {t("points.emptyText")}
      </EmptyState>
    );
  } else if (!plan.reachable || plan.options.length === 0) {
    body = (
      <EmptyState
        icon="alert"
        title={t(plan.accessible ? "citizen.noAccessibleRoute" : "citizen.noRoute")}
        action={<ButtonLink to="/app/sos" variant="danger" size="lg" icon="sos">{t("citizen.sendSos")}</ButtonLink>}
      >
        {t(plan.accessible ? "citizen.noAccessibleRouteHelp" : "citizen.noRouteHelp")}
      </EmptyState>
    );
  } else {
    body = (
      <>
        {plan.all_full && <Banner tone="warn">{t("citizen.allFull")}</Banner>}
        <List label={title}>
          {plan.options.map((option) => {
            const isSelected = option.point.id === plan.selected_point_id;
            return (
              <li key={option.point.id}>
                <ListRow
                  to={`/app/points/${option.point.id}`}
                  icon={kindIcon(option.point.kind)}
                  title={pointName(option.point.name)}
                  subtitle={`${t(`kind.${option.point.kind}`)} · ${routeSummary(option)}`}
                  selected={isSelected}
                >
                  <Meter
                    pct={option.point.occupancy_pct}
                    level={option.level}
                    label={t("citizen.occupancy")}
                    valueText={occupancyText(option.point.occupancy_pct, option.level)}
                  />
                  {(isSelected || option.point.id === plan.recommended_point_id) && (
                    <span className="badges">
                      {isSelected && <Badge tone="accent" solid icon="route">{t("citizen.selected")}</Badge>}
                      {option.point.id === plan.recommended_point_id && <Badge tone="accent">{t("citizen.recommended")}</Badge>}
                    </span>
                  )}
                </ListRow>
              </li>
            );
          })}
        </List>
        <Button variant="quiet" icon="pin" onClick={() => setChoosing(true)}>{t("citizen.changePosition")}</Button>
      </>
    );
  }

  return (
    <div className="screen">
      <TopBar title={title} />
      <div className="screen__body" aria-busy={planning || undefined}>{body}</div>
      <LocationSheet open={choosing} onClose={() => setChoosing(false)} />
    </div>
  );
}

/** `/app/points/:id`: decide. Everything about one point, and "Go here" at thumb height. */
export function PointDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { plan, planning, selectPoint } = useCitizen();
  const option = plan?.options.find((o) => String(o.point.id) === id);

  if (!option || !plan) {
    return (
      <div className="screen">
        <TopBar title={t("points.detailTitle")} backTo="/app/points" />
        <EmptyState
          icon="pin"
          title={t("points.missingTitle")}
          action={<ButtonLink to="/app/points" variant="primary" icon="list">{t("points.backToList")}</ButtonLink>}
        >
          {t("points.missingText")}
        </EmptyState>
      </div>
    );
  }

  const { point } = option;
  const isSelected = point.id === plan.selected_point_id;
  const go = async () => {
    if (isSelected || (await selectPoint(point.id))) navigate("/app/map");
  };

  return (
    <div className="screen">
      <TopBar title={t("points.detailTitle")} backTo="/app/points" />
      <div className="screen__body">
        <div className="detail-head">
          <span className="detail-head__icon"><Icon name={kindIcon(point.kind)} size="lg" /></span>
          <div>
            <h2 className="route-title">{pointName(point.name)}</h2>
            <p className="muted">{t(`kind.${point.kind}`)}</p>
          </div>
        </div>
        <div className="badges">
          {plan.routing_mode === "fallback" && <Badge tone="warn" icon="offline">{t("routing.badge")}</Badge>}
          {isSelected && <Badge tone="accent" solid icon="route">{t("citizen.selected")}</Badge>}
          {point.id === plan.recommended_point_id && <Badge tone="accent">{t("citizen.recommended")}</Badge>}
          {point.is_accessible && <Badge tone="priority" icon="accessible">{t("citizen.accessibleEntrance")}</Badge>}
        </div>

        <dl className="facts">
          <div>
            <dt>{t("points.distance")}</dt>
            <dd>{formatDistance(option.distance_m)}</dd>
          </div>
          <div>
            <dt>{t("points.eta")}</dt>
            <dd>{formatEta(option.eta_s)}</dd>
          </div>
          <div className="facts__wide">
            <dt>{t("citizen.occupancy")}</dt>
            <dd>
              <Meter
                pct={point.occupancy_pct}
                level={option.level}
                label={t("citizen.occupancy")}
                valueText={occupancyText(point.occupancy_pct, option.level)}
                size="lg"
              />
              <span className="muted">
                {t("points.people", { occupancy: formatNumber(point.occupancy), capacity: formatNumber(point.capacity) })}
              </span>
            </dd>
          </div>
          <div className="facts__wide">
            <dt>{t("points.entrance")}</dt>
            <dd>{t(point.is_accessible ? "citizen.accessibleEntrance" : "points.entranceUnknown")}</dd>
          </div>
        </dl>
      </div>
      <div className="screen__actions">
        <Button variant="primary" size="lg" icon={isSelected ? "map" : "route"} block busy={planning} onClick={() => void go()}>
          {t(isSelected ? "points.showRoute" : "citizen.goHere")}
        </Button>
      </div>
    </div>
  );
}

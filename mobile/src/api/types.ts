export type Level = "green" | "yellow" | "red";
export type LatLng = [number, number];

export interface Zone {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export interface Hazard {
  code: string;
  label: string;
  color: string;
  icon: string;
}

export interface Thresholds {
  occupancy_yellow_pct: number;
  occupancy_red_pct: number;
  reroute_occupancy_pct: number;
  critical_occupancy_pct: number;
  sos_cluster_radius_m: number;
  sos_cluster_window_min: number;
  sos_cluster_min_count: number;
  sos_dedup_window_s: number;
}

export interface Meta {
  zones: Zone[];
  hazards: Hazard[];
  thresholds: Thresholds;
  map: { center: LatLng; zoom: number };
  routing_provider: string;
  sim_enabled: boolean;
  roles: { code: CitizenRole; sos_priority: number; accessible_route: boolean }[];
}

export type CitizenRole = "standard" | "mobility_impaired";
export const PRIORITY_ROLE: CitizenRole = "mobility_impaired";
/** SOS priority value meaning "Priority #1". */
export const CRITICAL_PRIORITY = 1;

export interface AssemblyPoint {
  id: number;
  name: string;
  kind: "shelter" | "park" | "stadium";
  lat: number;
  lng: number;
  capacity: number;
  occupancy: number;
  occupancy_pct: number;
  is_active: boolean;
  is_reserve: boolean;
  is_accessible: boolean;
  zone_id: string;
}

export interface EvacuationOption {
  point: AssemblyPoint;
  distance_m: number;
  eta_s: number;
  geometry: LatLng[];
  edge_ids: string[];
  level: Level;
}

/** `fallback`: the external routing API is down and routes come from a local source. */
export type RoutingMode = "live" | "fallback";
/** Where fallback routes come from: the last cached route, the local street database, or straight-line estimates. */
export type FallbackSource = "cache" | "local_graph" | "static_matrix";

export interface EvacuationPlan {
  origin: { lat: number; lng: number };
  options: EvacuationOption[];
  recommended_point_id: number | null;
  selected_point_id: number | null;
  reachable: boolean;
  all_full: boolean;
  accessible: boolean;
  routing_mode: RoutingMode;
  fallback_source: FallbackSource | null;
}

export interface Sos {
  id: number;
  citizen_id: string;
  lat: number;
  lng: number;
  zone_id: string;
  hazard_type: string;
  status: "open" | "resolved";
  created_at: string;
  resolved_at: string | null;
  priority: number;
  citizen_role: string;
}

export interface CitizenState {
  citizen_id: string;
  role: CitizenRole;
  is_safe: boolean;
  lat: number | null;
  lng: number | null;
  target_point_id: number | null;
  open_sos: Sos | null;
}

export interface RoadNode {
  id: string;
  lat: number;
  lng: number;
}

export interface RoadEdge {
  id: string;
  name: string;
  source: string;
  target: string;
  length_m: number;
  is_open: boolean;
  is_accessible: boolean;
  /** OSM highway class: trunk, primary, secondary, tertiary, residential … */
  kind: string;
  /** Polyline of the street segment. */
  geometry: LatLng[];
}

export interface Roads {
  nodes: RoadNode[];
  edges: RoadEdge[];
}

export type BrigadeStatus = "available" | "en_route" | "on_site" | "returning";

export interface Brigade {
  id: number;
  name: string;
  status: BrigadeStatus;
  lat: number;
  lng: number;
  target_lat: number | null;
  target_lng: number | null;
  target_alert_id: number | null;
  eta_s: number | null;
  route: LatLng[];
}

export interface Alert {
  id: number;
  rule_id: string;
  severity: "red" | "orange";
  status: "open" | "confirmed" | "dismissed";
  dedup_key: string;
  message: string;
  lat: number;
  lng: number;
  zone_id: string | null;
  payload: Record<string, any>;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  dismiss_reason: string | null;
  actions: Record<string, any>;
}

export interface ConfirmResult {
  alert: Alert;
  brigade: Brigade | null;
  activated_point: AssemblyPoint | null;
  already_processed: boolean;
}

export interface AuditEntry {
  id: number;
  actor: string;
  action: string;
  alert_id: number | null;
  details: Record<string, any>;
  created_at: string;
}

export interface Snapshot {
  zones: Zone[];
  assembly_points: AssemblyPoint[];
  brigades: Brigade[];
  sos: Sos[];
  sos_by_zone: Record<string, number>;
  alerts: Alert[];
  recent_alerts: Alert[];
  audit: AuditEntry[];
  roads: Roads;
  stats: {
    open_sos: number;
    closed_roads: number;
    safe_citizens: number;
    tracked_citizens: number;
  };
}

/** Dispatcher roles. observer: read-only; dispatcher: + decide on alerts and brigades; admin: + simulator. */
export type OperatorRole = "admin" | "dispatcher" | "observer";

export interface ScenarioStatus {
  running: boolean;
  scenario: string | null;
  step: number;
  total: number;
  message: string;
  code?: string;
  params?: Record<string, string | number>;
}

/** WebSocket envelope: every server push has this shape. */
export interface WsMessage<T = any> {
  type: string;
  ts: string;
  data: T;
}

export interface ReroutePush {
  citizen_id: string;
  reason: "road_closed" | "point_full" | "alert_confirmed";
  changed: boolean;
  detail: Record<string, any>;
  plan: EvacuationPlan;
  previous_point_id: number | null;
}

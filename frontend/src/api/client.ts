import { t } from "../i18n";
import type {
  Alert,
  AssemblyPoint,
  AuditEntry,
  Brigade,
  BrigadeStatus,
  CitizenRole,
  CitizenState,
  ConfirmResult,
  EvacuationPlan,
  Meta,
  OperatorRole,
  RoadEdge,
  Roads,
  ScenarioStatus,
  Snapshot,
  Sos,
} from "./types";

const BASE = `${import.meta.env.VITE_API_BASE ?? ""}/api/v1`;

/** Error carrying the backend's `{error: {code, message, details}}` body. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network", t("errors.network"));
  }
  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code ?? "http_error",
      error?.message ?? t("errors.generic"),
      error?.details,
    );
  }
  return payload as T;
}

export interface RouteRequest {
  lat?: number;
  lng?: number;
  zone_id?: string;
  target_point_id?: number;
  role?: CitizenRole;
}

export const api = {
  meta: () => request<Meta>("GET", "/meta"),
  roads: () => request<Roads>("GET", "/roads"),
  trackRoute: (citizenId: string, body: RouteRequest) =>
    request<EvacuationPlan>("POST", `/citizens/${citizenId}/route`, body),
  citizenState: (citizenId: string) => request<CitizenState>("GET", `/citizens/${citizenId}/state`),
  sendSos: (body: { citizen_id: string; lat: number; lng: number; hazard_type: string; role: CitizenRole }) =>
    request<{ sos: Sos; duplicate: boolean }>("POST", "/sos", body),
  markSafe: (citizenId: string) =>
    request<{ is_safe: boolean; resolved_sos_ids: number[] }>("POST", `/citizens/${citizenId}/safe`),

  login: (username: string, password: string) =>
    request<{ token: string; operator: string; role?: OperatorRole; expires_in?: number }>("POST", "/auth/login", { username, password }),
  me: (token: string) =>
    request<{ operator: string; role: OperatorRole; permissions: string[] }>("GET", "/auth/me", undefined, token),
  snapshot: (token: string) => request<Snapshot>("GET", "/dashboard/snapshot", undefined, token),
  audit: (token: string) => request<AuditEntry[]>("GET", "/audit-log?limit=30", undefined, token),
  confirmAlert: (token: string, id: number) =>
    request<ConfirmResult>("POST", `/alerts/${id}/confirm`, undefined, token),
  dismissAlert: (token: string, id: number, reason: string) =>
    request<Alert>("POST", `/alerts/${id}/dismiss`, { reason }, token),
  setBrigadeStatus: (token: string, id: number, status: BrigadeStatus) =>
    request<Brigade>("PATCH", `/brigades/${id}/status`, { status }, token),

  sim: {
    sos: (token: string, zone_id: string, count: number, hazard_type?: string, role?: CitizenRole) =>
      request<Sos[]>("POST", "/sim/sos", { zone_id, count, hazard_type: hazard_type || null, role: role ?? null }, token),
    occupancy: (token: string, pointId: number, body: { delta_pct?: number; occupancy_pct?: number }) =>
      request<AssemblyPoint>("POST", `/sim/assembly-points/${pointId}/occupancy`, body, token),
    setRoad: (token: string, edgeId: string, open: boolean) =>
      request<RoadEdge>("POST", `/sim/roads/${edgeId}/${open ? "open" : "close"}`, undefined, token),
    randomRoads: (token: string, action: "close" | "open", count: number) =>
      request<RoadEdge[]>("POST", "/sim/roads/random", { action, count }, token),
    openAllRoads: (token: string) => request<RoadEdge[]>("POST", "/sim/roads/open-all", undefined, token),
    startScenario: (token: string, name: string) =>
      request<ScenarioStatus>("POST", `/sim/scenario/${name}`, { speed: 1, reset: true }, token),
    scenarioStatus: (token: string) => request<ScenarioStatus>("GET", "/sim/scenario", undefined, token),
    stopScenario: (token: string) => request<ScenarioStatus>("DELETE", "/sim/scenario", undefined, token),
    reset: (token: string) => request<void>("POST", "/sim/reset", undefined, token),
  },
};

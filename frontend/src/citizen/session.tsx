/**
 * Citizen session: everything the citizen app knows, held above the screens
 * so it survives navigation between tabs.
 *
 * Screens read it with `useCitizen()` and call its actions; none of them
 * fetches data or opens a socket. The store uses the platform adapters only
 * (storage, geolocation, haptics), so it moves to React Native unchanged.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError, type RouteRequest } from "../api/client";
import {
  PRIORITY_ROLE,
  type CitizenRole,
  type EvacuationOption,
  type EvacuationPlan,
  type Meta,
  type ReroutePush,
  type Roads,
  type Sos,
  type WsMessage,
} from "../api/types";
import { getCitizenId } from "../lib/citizenId";
import { haversineM, occupancyLevel } from "../lib/format";
import { retryAfterSeconds } from "../lib/labels";
import { useLiveSocket } from "../lib/useLiveSocket";
import { LocationError, platform, STORAGE_KEYS, type Position } from "../platform";
import { rerouteBanner, type CitizenBanner } from "./banner";

const DEFAULT_CENTER: [number, number] = [40.4, 49.87];
const DEMO_AREA_RADIUS_M = 40_000;
/** Time to undo an SOS before it is sent. */
export const SOS_UNDO_MS = 5_000;

export type BootStatus = "loading" | "ready" | "error";
export type LocateResult = "ok" | "denied" | "outside" | "failed";
export type SosResult = "sent" | "duplicate" | "needPosition" | "failed";

export interface PendingSos {
  hazard: string;
  /** Epoch ms at which the signal goes out unless undone. */
  sendAt: number;
}

interface CitizenSession {
  citizenId: string;
  boot: BootStatus;
  bootError: unknown;
  retryBoot: () => void;
  connected: boolean;

  meta: Meta | null;
  roads: Roads | null;
  center: [number, number];
  zoom: number;

  role: CitizenRole;
  priority: boolean;
  setRole: (role: CitizenRole) => void;

  plan: EvacuationPlan | null;
  /** The option the citizen is being routed to. */
  selected: EvacuationOption | null;
  /** A route request is in flight. */
  planning: boolean;
  zoneId: string;
  /** Changes whenever a new route should be brought into view. */
  routeVersion: number;

  locateDevice: () => Promise<LocateResult>;
  chooseZone: (zoneId: string) => Promise<boolean>;
  setPosition: (position: Position) => Promise<boolean>;
  selectPoint: (pointId: number) => Promise<boolean>;

  sos: Sos | null;
  pendingSos: PendingSos | null;
  sosBusy: boolean;
  /** Start the undo window for an SOS of this hazard type. */
  startSos: (hazard: string) => void;
  undoSos: () => void;
  /** Skip the rest of the undo window. */
  sendSosNow: () => void;
  /** Result of the last send attempt, for the SOS screen. */
  sosResult: SosResult | null;

  safe: boolean;
  safeBusy: boolean;
  markSafe: () => Promise<boolean>;
  /** Leave the "safe" state to plan a route or call for help again. */
  clearSafe: () => void;

  banner: CitizenBanner | null;
  dismissBanner: () => void;

  onboarded: boolean;
  completeOnboarding: () => void;
}

const Context = createContext<CitizenSession | null>(null);

export function useCitizen(): CitizenSession {
  const session = useContext(Context);
  if (!session) throw new Error("useCitizen must be used inside <CitizenSessionProvider>");
  return session;
}

function storedRole(): CitizenRole {
  return platform.storage.get(STORAGE_KEYS.role) === PRIORITY_ROLE ? PRIORITY_ROLE : "standard";
}

function storedBanner(): CitizenBanner | null {
  try {
    const raw = platform.storage.get(STORAGE_KEYS.citizenBanner);
    return raw ? (JSON.parse(raw) as CitizenBanner) : null;
  } catch {
    return null;
  }
}

function errorBanner(error: unknown): CitizenBanner {
  if (error instanceof ApiError) {
    const seconds = retryAfterSeconds(error.details);
    return {
      tone: "danger",
      kind: "error",
      data: { code: error.code, message: error.message, ...(seconds === "" ? {} : { seconds }) },
    };
  }
  return { tone: "danger", kind: "error", data: { code: "generic" } };
}

export function CitizenSessionProvider({ children }: { children: ReactNode }) {
  const citizenId = useMemo(getCitizenId, []);
  const [boot, setBoot] = useState<BootStatus>("loading");
  const [bootError, setBootError] = useState<unknown>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [roads, setRoads] = useState<Roads | null>(null);
  const [plan, setPlan] = useState<EvacuationPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [routeVersion, setRouteVersion] = useState(0);
  const [zoneId, setZoneIdState] = useState(() => platform.storage.get(STORAGE_KEYS.citizenZone) ?? "");
  const [role, setRoleState] = useState<CitizenRole>(storedRole);
  const [sos, setSos] = useState<Sos | null>(null);
  const [pendingSos, setPendingSos] = useState<PendingSos | null>(null);
  const [sosBusy, setSosBusy] = useState(false);
  const [sosResult, setSosResult] = useState<SosResult | null>(null);
  const [safe, setSafe] = useState(false);
  const [safeBusy, setSafeBusy] = useState(false);
  const [banner, setBannerState] = useState<CitizenBanner | null>(storedBanner);
  const [onboarded, setOnboarded] = useState(() => platform.storage.get(STORAGE_KEYS.onboarded) === "1");

  // Refs give socket handlers and timers the latest state without re-subscribing.
  const planRef = useRef(plan);
  planRef.current = plan;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const roleRef = useRef(role);
  roleRef.current = role;

  /** Route-change and info banners survive a refresh; errors do not. */
  const setBanner = useCallback((next: CitizenBanner | null) => {
    setBannerState(next);
    if (next && next.kind !== "error") platform.storage.set(STORAGE_KEYS.citizenBanner, JSON.stringify(next));
    else platform.storage.remove(STORAGE_KEYS.citizenBanner);
  }, []);

  const setZoneId = useCallback((value: string) => {
    setZoneIdState(value);
    if (value) platform.storage.set(STORAGE_KEYS.citizenZone, value);
    else platform.storage.remove(STORAGE_KEYS.citizenZone);
  }, []);

  /** Every plan request carries the role, so the server always knows the profile. */
  const loadPlan = useCallback(
    async (request: RouteRequest): Promise<boolean> => {
      setPlanning(true);
      try {
        setPlan(await api.trackRoute(citizenId, { ...request, role: roleRef.current }));
        setRouteVersion((v) => v + 1);
        setSafe(false);
        setBannerState((current) => (current?.kind === "error" ? null : current));
        return true;
      } catch (error) {
        setBanner(errorBanner(error));
        return false;
      } finally {
        setPlanning(false);
      }
    },
    [citizenId, setBanner],
  );

  /** Recompute the current plan (after a reset or a new point opening), keeping a manual choice. */
  const refreshPlan = useCallback(
    (keepManualChoice = true) => {
      const current = planRef.current;
      if (!current) return;
      const manual = keepManualChoice && current.selected_point_id !== current.recommended_point_id;
      void loadPlan({
        lat: current.origin.lat,
        lng: current.origin.lng,
        target_point_id: manual ? current.selected_point_id ?? undefined : undefined,
      });
    },
    [loadPlan],
  );

  const loadRoads = useCallback(() => {
    // The street network is large and only decorates the map, so it never blocks the first screen.
    void api.roads().then(setRoads).catch(() => undefined);
  }, []);

  const loadInitial = useCallback(async () => {
    try {
      const [metaData, state] = await Promise.all([api.meta(), api.citizenState(citizenId)]);
      setMeta(metaData);
      setSos(state.open_sos);
      setSafe(state.is_safe);
      // Returning citizen: restore the route the server is tracking.
      if (state.lat !== null && state.lng !== null && state.target_point_id !== null && !planRef.current) {
        await loadPlan({ lat: state.lat, lng: state.lng });
      }
      setBoot("ready");
      setBootError(null);
    } catch (error) {
      setBootError(error);
      // A failed refresh after a reconnect must not replace a working screen with an error.
      setBoot((current) => (current === "ready" ? "ready" : "error"));
    }
  }, [citizenId, loadPlan]);

  useEffect(() => {
    void loadInitial();
    loadRoads();
  }, [loadInitial, loadRoads]);

  const retryBoot = useCallback(() => {
    setBoot("loading");
    void loadInitial();
    loadRoads();
  }, [loadInitial, loadRoads]);

  const onMessage = useCallback(
    (message: WsMessage) => {
      switch (message.type) {
        case "citizen.rerouted": {
          const push = message.data as ReroutePush;
          setPlan(push.plan);
          if (push.changed) setRouteVersion((v) => v + 1);
          setBanner(rerouteBanner(push));
          platform.haptics.warning();
          break;
        }
        case "road.changed":
          setRoads((current) =>
            current && {
              ...current,
              edges: current.edges.map((e) => (e.id === message.data.edge.id ? message.data.edge : e)),
            },
          );
          break;
        case "assembly.occupancy": {
          const point = message.data.point;
          const level = occupancyLevel(point.occupancy_pct, metaRef.current?.thresholds);
          setPlan((current) =>
            current && {
              ...current,
              options: current.options.map((o) => (o.point.id === point.id ? { ...o, point, level } : o)),
            },
          );
          break;
        }
        case "assembly.activated":
          refreshPlan();
          break;
        case "citizen.safe":
          setSafe(true);
          setSos(null);
          setPlan(null);
          break;
        case "system.reset":
          setSos(null);
          setSafe(false);
          setBanner(null);
          loadRoads();
          refreshPlan();
          break;
      }
    },
    [refreshPlan, loadRoads, setBanner],
  );

  const connected = useLiveSocket(`/ws/citizen/${citizenId}`, onMessage, () => {
    void loadInitial();
    refreshPlan();
  });

  /** Device position, rejected when it is outside the demo city. */
  const locateInCity = useCallback(async (): Promise<Position> => {
    const position = await platform.geolocation.current();
    const [lat, lng] = metaRef.current?.map.center ?? DEFAULT_CENTER;
    if (haversineM(position.lat, position.lng, lat, lng) > DEMO_AREA_RADIUS_M) throw new Error("outside");
    return position;
  }, []);

  const locateDevice = useCallback(async (): Promise<LocateResult> => {
    try {
      const position = await locateInCity();
      setZoneId("");
      return (await loadPlan(position)) ? "ok" : "failed";
    } catch (error) {
      if (error instanceof LocationError && error.reason === "denied") return "denied";
      if (error instanceof Error && error.message === "outside") return "outside";
      return "denied";
    }
  }, [locateInCity, loadPlan, setZoneId]);

  const chooseZone = useCallback(
    (value: string) => {
      setZoneId(value);
      return loadPlan({ zone_id: value });
    },
    [loadPlan, setZoneId],
  );

  const setPosition = useCallback(
    (position: Position) => {
      setZoneId("");
      return loadPlan(position);
    },
    [loadPlan, setZoneId],
  );

  const selectPoint = useCallback(
    (pointId: number) => {
      const current = planRef.current;
      if (!current) return Promise.resolve(false);
      setBanner(null);
      return loadPlan({ lat: current.origin.lat, lng: current.origin.lng, target_point_id: pointId });
    },
    [loadPlan, setBanner],
  );

  /** Switch the special-care role and re-plan with the new profile. */
  const setRole = useCallback(
    (next: CitizenRole) => {
      if (next === roleRef.current) return;
      platform.storage.set(STORAGE_KEYS.role, next);
      roleRef.current = next;
      setRoleState(next);
      setBanner(null);
      // A point picked under the old profile may not be barrier-free: start from the recommendation.
      refreshPlan(false);
    },
    [refreshPlan, setBanner],
  );

  const sendSos = useCallback(
    async (hazard: string) => {
      setSosBusy(true);
      setSosResult(null);
      try {
        // Known position first; otherwise ask the device once before giving up.
        const position = planRef.current?.origin ?? (await locateInCity().catch(() => null));
        if (!position) return setSosResult("needPosition");
        const result = await api.sendSos({
          citizen_id: citizenId,
          lat: position.lat,
          lng: position.lng,
          hazard_type: hazard,
          role: roleRef.current,
        });
        setSos(result.sos);
        setSafe(false);
        setSosResult(result.duplicate ? "duplicate" : "sent");
        platform.haptics.success();
        if (!planRef.current) await loadPlan(position);
      } catch (error) {
        setSosResult("failed");
        setBanner(errorBanner(error));
      } finally {
        setSosBusy(false);
      }
    },
    [citizenId, locateInCity, loadPlan, setBanner],
  );

  const startSos = useCallback((hazard: string) => {
    setSosResult(null);
    setPendingSos({ hazard, sendAt: Date.now() + SOS_UNDO_MS });
  }, []);

  const undoSos = useCallback(() => setPendingSos(null), []);

  const pendingRef = useRef(pendingSos);
  pendingRef.current = pendingSos;
  const sendSosNow = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    setPendingSos(null);
    void sendSos(pending.hazard);
  }, [sendSos]);

  // The undo window runs here, not in the SOS screen, so leaving that screen does not cancel the signal.
  useEffect(() => {
    if (!pendingSos) return;
    const timer = setTimeout(sendSosNow, Math.max(0, pendingSos.sendAt - Date.now()));
    return () => clearTimeout(timer);
  }, [pendingSos, sendSosNow]);

  const markSafe = useCallback(async () => {
    setSafeBusy(true);
    try {
      await api.markSafe(citizenId);
      setPendingSos(null);
      setSafe(true);
      setSos(null);
      setPlan(null);
      setSosResult(null);
      setBanner(null);
      platform.haptics.success();
      return true;
    } catch (error) {
      setBanner(errorBanner(error));
      return false;
    } finally {
      setSafeBusy(false);
    }
  }, [citizenId, setBanner]);

  const clearSafe = useCallback(() => setSafe(false), []);
  const dismissBanner = useCallback(() => setBanner(null), [setBanner]);

  const completeOnboarding = useCallback(() => {
    platform.storage.set(STORAGE_KEYS.onboarded, "1");
    setOnboarded(true);
  }, []);

  const selected = plan?.options.find((o) => o.point.id === plan.selected_point_id) ?? null;

  const value: CitizenSession = {
    citizenId,
    boot,
    bootError,
    retryBoot,
    connected,
    meta,
    roads,
    center: meta?.map.center ?? DEFAULT_CENTER,
    zoom: meta?.map.zoom ?? 12,
    role,
    priority: role === PRIORITY_ROLE,
    setRole,
    plan,
    selected,
    planning,
    zoneId,
    routeVersion,
    locateDevice,
    chooseZone,
    setPosition,
    selectPoint,
    sos,
    pendingSos,
    sosBusy,
    startSos,
    undoSos,
    sendSosNow,
    sosResult,
    safe,
    safeBusy,
    markSafe,
    clearSafe,
    banner,
    dismissBanner,
    onboarded,
    completeOnboarding,
  };

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

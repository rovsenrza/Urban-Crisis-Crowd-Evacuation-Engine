/**
 * Dispatcher session: sign-in, the dashboard state and every action, held
 * above the console's screens so navigating between them loses nothing.
 *
 * It wraps the dashboard reducer in `state.ts` and adds what that reducer
 * does not keep: past alerts and a persisted event feed.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { ApiError, api } from "../api/client";
import { CRITICAL_PRIORITY, type Alert, type BrigadeStatus, type LatLng, type Meta, type OperatorRole, type WsMessage, type Zone } from "../api/types";
import { errorText } from "../lib/labels";
import { useLiveSocket } from "../lib/useLiveSocket";
import type { MapTarget, SceneFocus } from "../map/scene";
import { platform, STORAGE_KEYS } from "../platform";
import { decisionText } from "./describe";
import { initialState, reducer, type Action, type DashboardState, type FeedItem } from "./state";

const TOAST_MS = 9000;
const FEED_LIMIT = 60;
/** The re-routing audit entry is written right after a decision. */
const AUDIT_REFRESH_MS = 400;
/** Socket messages are applied in batches this far apart, so a flood of SOS causes a few renders, not hundreds. */
const WS_FLUSH_MS = 100;
const ROLES: OperatorRole[] = ["admin", "dispatcher", "observer"];

/** What a role may do beyond reading. `decide`: confirm/dismiss alerts, set brigade status. `simulate`: everything under /sim. */
export type Permission = "decide" | "simulate";
const PERMISSIONS: Record<OperatorRole, Permission[]> = {
  admin: ["decide", "simulate"],
  dispatcher: ["decide"],
  observer: [],
};

function storedRole(): OperatorRole {
  const stored = platform.storage.get(STORAGE_KEYS.operatorRole) as OperatorRole | null;
  // A token saved before roles existed belongs to the one old account, which could do everything.
  return stored && ROLES.includes(stored) ? stored : "admin";
}

export type ConsoleStatus = "idle" | "loading" | "ready" | "error";

interface ConsoleState {
  dash: DashboardState;
  /** Confirmed and dismissed alerts, newest first. */
  past: Alert[];
  /** The socket messages behind the feed, newest first. Persisted so the feed survives a refresh. */
  log: WsMessage[];
}

type ConsoleAction = Action | { type: "clear" } | { type: "batch"; messages: WsMessage[] };

/** Feed entries for stored messages, produced by the dashboard reducer itself so the wording stays in one place. */
function feedFromLog(log: WsMessage[], zones: Zone[]): FeedItem[] {
  return log
    .map((message) => reducer({ ...initialState, zones }, { type: "ws", message }).feed[0])
    .filter((item): item is FeedItem => Boolean(item));
}

const newestFirst = (a: Alert, b: Alert) => b.id - a.id;

function consoleReducer(state: ConsoleState, action: ConsoleAction): ConsoleState {
  if (action.type === "clear") return { dash: initialState, past: [], log: [] };
  // Many socket messages in one pass: one state update and one render for the whole batch.
  if (action.type === "batch") {
    return action.messages.reduce<ConsoleState>((next, message) => consoleReducer(next, { type: "ws", message }), state);
  }
  const dash = reducer(state.dash, action);
  if (action.type === "snapshot") {
    const past = action.snapshot.recent_alerts.filter((a) => a.status !== "open").sort(newestFirst);
    const feed = dash.feed.length === 0 ? feedFromLog(state.log, dash.zones) : dash.feed;
    return { ...state, dash: { ...dash, feed }, past };
  }
  if (action.type !== "ws") return { ...state, dash };

  const { message } = action;
  let { past, log } = state;
  if (message.type === "system.reset") {
    past = [];
    log = [message];
  } else if (dash.feed[0] !== state.dash.feed[0]) {
    log = [message, ...log].slice(0, FEED_LIMIT);
  }
  if (message.type === "alert.confirmed" || message.type === "alert.dismissed") {
    const alert: Alert = message.data.alert;
    past = [alert, ...past.filter((a) => a.id !== alert.id)];
  }
  return { dash, past, log };
}

function storedLog(): WsMessage[] {
  try {
    const raw = platform.storage.get(STORAGE_KEYS.operatorFeed);
    return raw ? (JSON.parse(raw) as WsMessage[]) : [];
  } catch {
    return [];
  }
}

export interface ToastMessage {
  tone: "ok" | "danger";
  /** Rendered lazily so the toast follows the language switch. */
  render: () => string;
}

interface OperatorSession {
  token: string | null;
  /** Signed-in account name and role. */
  operator: string;
  role: OperatorRole;
  /** Whether the signed-in role may do this. Controls it cannot use are not shown. */
  can: (permission: Permission) => boolean;
  /** The last session ended because the token was rejected. */
  expired: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;

  /** Public server info; loaded even when signed out (the sign-in form needs `sim_enabled`). */
  meta: Meta | null;
  status: ConsoleStatus;
  error: unknown;
  retry: () => void;
  connected: boolean;

  state: DashboardState;
  pastAlerts: Alert[];

  toast: ToastMessage | null;
  dismissToast: () => void;

  /** Runs an API call: an expired session returns to sign-in, other errors become a toast. Resolves to success. */
  run: (action: (token: string) => Promise<unknown>) => Promise<boolean>;
  confirmAlert: (alert: Alert) => Promise<boolean>;
  dismissAlert: (alert: Alert, reason: string) => Promise<boolean>;
  setRoadOpen: (edgeId: string, open: boolean) => Promise<boolean>;
  setBrigadeStatus: (brigadeId: number, status: BrigadeStatus) => Promise<boolean>;
  refreshAudit: () => Promise<boolean>;

  /** What is selected on the live map. */
  selection: MapTarget | null;
  select: (target: MapTarget | null) => void;
  focus: SceneFocus | null;
  /** Select something and move the live map to it. */
  showOnMap: (target: MapTarget | null, point: LatLng) => void;
}

const Context = createContext<OperatorSession | null>(null);

export function useOperator(): OperatorSession {
  const session = useContext(Context);
  if (!session) throw new Error("useOperator must be used inside <OperatorSessionProvider>");
  return session;
}

export function OperatorSessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => platform.storage.get(STORAGE_KEYS.operatorToken));
  const [expired, setExpired] = useState(false);
  const [role, setRole] = useState<OperatorRole>(storedRole);
  const [operator, setOperator] = useState(() => platform.storage.get(STORAGE_KEYS.operatorName) ?? "");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [status, setStatus] = useState<ConsoleStatus>("idle");
  const [error, setError] = useState<unknown>(null);
  const [console_, dispatch] = useReducer(consoleReducer, undefined, () => ({ dash: initialState, past: [], log: storedLog() }));
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [selection, setSelection] = useState<MapTarget | null>(null);
  const [focus, setFocus] = useState<SceneFocus | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const focusCount = useRef(0);

  useEffect(() => {
    platform.storage.set(STORAGE_KEYS.operatorFeed, JSON.stringify(console_.log));
  }, [console_.log]);

  const notify = useCallback((tone: ToastMessage["tone"], render: () => string) => {
    setToast({ tone, render });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  const endSession = useCallback((wasExpired: boolean) => {
    platform.storage.remove(STORAGE_KEYS.operatorToken);
    platform.storage.remove(STORAGE_KEYS.operatorFeed);
    platform.storage.remove(STORAGE_KEYS.operatorRole);
    platform.storage.remove(STORAGE_KEYS.operatorName);
    setToken(null);
    setExpired(wasExpired);
    setStatus("idle");
    setSelection(null);
    setFocus(null);
    setToast(null);
    dispatch({ type: "clear" });
  }, []);
  const logout = useCallback(() => endSession(false), [endSession]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.login(username, password);
    platform.sound.unlock();
    platform.storage.set(STORAGE_KEYS.operatorToken, result.token);
    // A backend from before roles sends no `role`; its single account could do everything.
    const signedInRole = result.role ?? "admin";
    platform.storage.set(STORAGE_KEYS.operatorRole, signedInRole);
    platform.storage.set(STORAGE_KEYS.operatorName, result.operator);
    setRole(signedInRole);
    setOperator(result.operator);
    setExpired(false);
    setToken(result.token);
  }, []);

  const tokenRef = useRef(token);
  tokenRef.current = token;
  const roleRef = useRef(role);
  roleRef.current = role;
  const can = useCallback((permission: Permission) => PERMISSIONS[role].includes(permission), [role]);

  const run = useCallback(
    async (action: (token: string) => Promise<unknown>): Promise<boolean> => {
      const current = tokenRef.current;
      if (!current) return false;
      try {
        await action(current);
        return true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) endSession(true);
        else notify("danger", () => errorText(err));
        return false;
      }
    },
    [endSession, notify],
  );

  const focusOn = useCallback((prefix: string, point: LatLng) => {
    focusCount.current += 1;
    setFocus({ key: `${prefix}-${focusCount.current}`, point });
  }, []);

  /** First load and every reload. Failures surface at the shell, never as an endless "Loading…". */
  const load = useCallback(async () => {
    const current = tokenRef.current;
    if (!current) return;
    try {
      const metaData = await api.meta();
      setMeta(metaData);
      // The server is the authority on the role; the stored copy only avoids a flash on refresh.
      let currentRole = roleRef.current;
      try {
        const me = await api.me(current);
        currentRole = me.role;
        platform.storage.set(STORAGE_KEYS.operatorRole, me.role);
        platform.storage.set(STORAGE_KEYS.operatorName, me.operator);
        setRole(me.role);
        setOperator(me.operator);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) throw err;
        // Older backend without /auth/me: keep the stored role.
      }
      const [snapshot, scenario] = await Promise.all([
        api.snapshot(current),
        metaData.sim_enabled && PERMISSIONS[currentRole].includes("simulate") ? api.sim.scenarioStatus(current) : null,
      ]);
      dispatch({ type: "snapshot", snapshot });
      if (scenario) dispatch({ type: "scenario", scenario });
      setError(null);
      setStatus((previous) => {
        const first = [...snapshot.alerts].sort((a, b) => a.id - b.id)[0];
        if (previous !== "ready" && first) focusOn("alert", [first.lat, first.lng]);
        return "ready";
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return endSession(true);
      setError(err);
      // A failed reload after a reconnect keeps the working console on screen.
      setStatus((previous) => (previous === "ready" ? "ready" : "error"));
      if (tokenRef.current) notify("danger", () => errorText(err));
    }
  }, [endSession, focusOn, notify]);

  useEffect(() => {
    if (token) {
      setStatus("loading");
      void load();
    } else {
      // Signed out: the sign-in form still needs to know whether this is a demo server.
      void api.meta().then(setMeta).catch(() => undefined);
    }
  }, [token, load]);

  const retry = useCallback(() => {
    setStatus("loading");
    void load();
  }, [load]);

  const refreshAudit = useCallback(
    () => run(async (current) => dispatch({ type: "audit", audit: await api.audit(current) })),
    [run],
  );

  // Incoming messages are queued and applied together every WS_FLUSH_MS.
  const queue = useRef<WsMessage[]>([]);
  const flushTimer = useRef<ReturnType<typeof setTimeout>>();
  const alarmPending = useRef(false);

  const flush = useCallback(() => {
    flushTimer.current = undefined;
    const messages = queue.current;
    queue.current = [];
    // Signed out while messages were waiting: drop them.
    if (!tokenRef.current) {
      alarmPending.current = false;
      return;
    }
    if (messages.length) dispatch({ type: "batch", messages });
    // One alarm per batch, however many alerts or priority SOS it held.
    if (alarmPending.current) {
      alarmPending.current = false;
      platform.sound.alarm();
    }
  }, []);

  useEffect(() => () => clearTimeout(flushTimer.current), []);

  const onMessage = useCallback(
    (message: WsMessage) => {
      queue.current.push(message);
      flushTimer.current ??= setTimeout(flush, WS_FLUSH_MS);
      const prioritySos = message.type === "sos.created" && message.data.sos.priority === CRITICAL_PRIORITY;
      if (message.type === "alert.raised" || prioritySos) alarmPending.current = true;
      if (message.type === "alert.raised") focusOn("alert", [message.data.alert.lat, message.data.alert.lng]);
      if (message.type === "system.reset") {
        setSelection(null);
        void load();
      }
      if (message.type === "alert.confirmed" || message.type === "alert.dismissed") {
        setTimeout(() => void refreshAudit(), AUDIT_REFRESH_MS);
      }
    },
    [flush, focusOn, load, refreshAudit],
  );
  const connected = useLiveSocket(token ? `/ws/operator?token=${encodeURIComponent(token)}` : null, onMessage, load);

  const confirmAlert = useCallback(
    (alert: Alert) =>
      run(async (current) => {
        const result = await api.confirmAlert(current, alert.id);
        notify("ok", () => decisionText(result));
      }),
    [run, notify],
  );
  const dismissAlert = useCallback(
    (alert: Alert, reason: string) => run((current) => api.dismissAlert(current, alert.id, reason)),
    [run],
  );
  const setRoadOpen = useCallback(
    (edgeId: string, open: boolean) => run((current) => api.sim.setRoad(current, edgeId, open)),
    [run],
  );
  const setBrigadeStatus = useCallback(
    (brigadeId: number, next: BrigadeStatus) => run((current) => api.setBrigadeStatus(current, brigadeId, next)),
    [run],
  );

  const showOnMap = useCallback(
    (target: MapTarget | null, point: LatLng) => {
      setSelection(target);
      focusOn("show", point);
    },
    [focusOn],
  );

  const value = useMemo<OperatorSession>(
    () => ({
      token,
      operator,
      role,
      can,
      expired,
      login,
      logout,
      meta,
      status,
      error,
      retry,
      connected,
      state: console_.dash,
      pastAlerts: console_.past,
      toast,
      dismissToast,
      run,
      confirmAlert,
      dismissAlert,
      setRoadOpen,
      setBrigadeStatus,
      refreshAudit,
      selection,
      select: setSelection,
      focus,
      showOnMap,
    }),
    [token, operator, role, can, expired, login, logout, meta, status, error, retry, connected, console_, toast, dismissToast, run,
      confirmAlert, dismissAlert, setRoadOpen, setBrigadeStatus, refreshAudit, selection, focus, showOnMap],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

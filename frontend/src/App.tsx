import { Navigate, Route, Routes } from "react-router-dom";
import { CitizenRoot, CitizenShell } from "./citizen/CitizenShell";
import { MapScreen } from "./citizen/screens/MapScreen";
import { PointDetailScreen, PointsScreen } from "./citizen/screens/PointsScreen";
import { SettingsScreen } from "./citizen/screens/SettingsScreen";
import { SosScreen } from "./citizen/screens/SosScreen";
import { Welcome } from "./citizen/screens/Welcome";
import { hasCitizenId } from "./lib/citizenId";
import { OperatorRoot, OperatorShell } from "./operator/OperatorShell";
import { Alerts } from "./operator/screens/Alerts";
import { Audit } from "./operator/screens/Audit";
import { Live } from "./operator/screens/Live";
import { Login } from "./operator/screens/Login";
import { Resources } from "./operator/screens/Resources";
import { Simulation } from "./operator/screens/Simulation";
import { SosQueue } from "./operator/screens/SosQueue";
import { platform, STORAGE_KEYS } from "./platform";
import { NotFound } from "./shell/parts";

/** `/`: first-time users go through onboarding, everyone else straight to the map. */
function Start() {
  const returning = hasCitizenId() && platform.storage.get(STORAGE_KEYS.onboarded) === "1";
  return <Navigate to={returning ? "/app/map" : "/welcome"} replace />;
}

/**
 * Two products, one router.
 *
 * Citizen:    /welcome, /app/{map,points,points/:id,sos,settings}
 * Dispatcher: /operator/{login,live,alerts,alerts/:id,sos,resources,audit,simulation}
 */
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Start />} />

      <Route element={<CitizenRoot />}>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/app" element={<CitizenShell />}>
          <Route index element={<Navigate to="/app/map" replace />} />
          <Route path="map" element={<MapScreen />} />
          <Route path="points" element={<PointsScreen />} />
          <Route path="points/:id" element={<PointDetailScreen />} />
          <Route path="sos" element={<SosScreen />} />
          <Route path="settings" element={<SettingsScreen />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>

      <Route path="/operator" element={<OperatorRoot />}>
        <Route index element={<Navigate to="/operator/live" replace />} />
        <Route path="login" element={<Login />} />
        <Route element={<OperatorShell />}>
          <Route path="live" element={<Live />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="alerts/:id" element={<Alerts />} />
          <Route path="sos" element={<SosQueue />} />
          <Route path="resources" element={<Resources />} />
          <Route path="audit" element={<Audit />} />
          <Route path="simulation" element={<Simulation />} />
          <Route path="*" element={<NotFound home="/operator/live" />} />
        </Route>
      </Route>

      {/* Old addresses from the README, the demo script and bookmarks. */}
      <Route path="/citizen" element={<Navigate to="/app/map" replace />} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

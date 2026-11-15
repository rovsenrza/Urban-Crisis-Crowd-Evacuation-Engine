import { useCallback, useState } from "react";
import { t } from "../i18n";
import { useCitizen } from "./session";

/** Device location with its loading and error state, shared by every screen that offers it. */
export function useLocate(onDone?: () => void) {
  const { locateDevice } = useCitizen();
  const [locating, setLocating] = useState(false);
  const [failure, setFailure] = useState<"denied" | "outside" | null>(null);

  const locate = useCallback(async () => {
    setLocating(true);
    setFailure(null);
    const result = await locateDevice();
    setLocating(false);
    if (result === "ok") onDone?.();
    else if (result === "denied" || result === "outside") setFailure(result);
    return result;
  }, [locateDevice, onDone]);

  /** Message for the last failure, in the current language. */
  const errorText = failure ? t(failure === "outside" ? "citizen.geoOutside" : "citizen.geoDenied") : null;
  return { locate, locating, errorText, clearError: () => setFailure(null) };
}

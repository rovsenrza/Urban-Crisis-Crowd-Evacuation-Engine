import { platform, STORAGE_KEYS } from "../platform";

/** Anonymous, stable per device. No personal data is ever attached to it. */
export function getCitizenId(): string {
  let id = platform.storage.get(STORAGE_KEYS.citizenId);
  if (!id) {
    id = platform.uuid();
    platform.storage.set(STORAGE_KEYS.citizenId, id);
  }
  return id;
}

export function hasCitizenId(): boolean {
  return platform.storage.get(STORAGE_KEYS.citizenId) !== null;
}

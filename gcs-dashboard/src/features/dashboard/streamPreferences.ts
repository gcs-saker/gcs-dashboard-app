export interface StreamDeviceAliases {
  readonly [deviceId: string]: string;
}

export interface StreamPreferencesSnapshot {
  readonly deviceAliases: StreamDeviceAliases;
}

const STREAM_PREFERENCES_SESSION_KEY = "gcs-saker:stream-preferences:v1";
const EMPTY_STREAM_PREFERENCES: StreamPreferencesSnapshot = Object.freeze({
  deviceAliases: Object.freeze({}),
});

export function loadStreamPreferences(storage: Storage | null = getSessionStorage()): StreamPreferencesSnapshot {
  if (!storage) return EMPTY_STREAM_PREFERENCES;
  const raw = storage.getItem(STREAM_PREFERENCES_SESSION_KEY);
  if (!raw) return EMPTY_STREAM_PREFERENCES;

  try {
    const parsed = JSON.parse(raw) as Partial<StreamPreferencesSnapshot>;
    return {
      deviceAliases: isStringRecord(parsed.deviceAliases) ? parsed.deviceAliases : {},
    };
  } catch {
    return EMPTY_STREAM_PREFERENCES;
  }
}

export function saveStreamPreferences(
  preferences: StreamPreferencesSnapshot,
  storage: Storage | null = getSessionStorage(),
): void {
  if (!storage) return;
  storage.setItem(STREAM_PREFERENCES_SESSION_KEY, JSON.stringify(preferences));
}

export function setStreamDeviceAlias(
  preferences: StreamPreferencesSnapshot,
  deviceId: string,
  alias: string,
): StreamPreferencesSnapshot {
  const trimmedAlias = alias.trim();
  const nextAliases = { ...preferences.deviceAliases };
  if (trimmedAlias) {
    nextAliases[deviceId] = trimmedAlias;
  } else {
    delete nextAliases[deviceId];
  }
  return { ...preferences, deviceAliases: nextAliases };
}

export function applyStreamDeviceAliases<TDevice extends { id: string; name: string }>(
  devices: readonly TDevice[],
  aliases: StreamDeviceAliases,
): TDevice[] {
  return devices.map((device) => {
    const alias = aliases[device.id]?.trim();
    return alias ? { ...device, name: alias } : device;
  });
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage ?? null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}

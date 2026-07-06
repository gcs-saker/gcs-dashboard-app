export interface StreamDeviceAliases {
  readonly [deviceId: string]: string;
}

export interface StreamPreferencesSnapshot {
  readonly deviceAliases: StreamDeviceAliases;
}

export const EMPTY_STREAM_PREFERENCES: StreamPreferencesSnapshot = Object.freeze({
  deviceAliases: Object.freeze({}),
});

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

export function normalizeStreamPreferencesSnapshot(value: unknown): StreamPreferencesSnapshot {
  if (!value || typeof value !== "object") return EMPTY_STREAM_PREFERENCES;
  const aliases = (value as Partial<StreamPreferencesSnapshot>).deviceAliases;
  if (!aliases || typeof aliases !== "object" || Array.isArray(aliases)) return EMPTY_STREAM_PREFERENCES;
  const deviceAliases = Object.fromEntries(
    Object.entries(aliases).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  return { deviceAliases };
}

import {
  normalizeStreamPreferencesSnapshot,
  type StreamDeviceAliases,
  type StreamPreferencesSnapshot,
} from "@dashboard/preferences/streamPreferences";
import {
  readIndexedDbRecord,
  writeIndexedDbRecord,
} from "@dashboard/preferences/indexedDbStore";

export const STREAM_ALIAS_DB_NAME = "gcs-saker-dashboard-stream-aliases";
export const STREAM_ALIAS_DB_VERSION = 1;
export const STREAM_ALIAS_STORE_NAME = "streamAliases";

const STREAM_ALIAS_STORE_CONFIG = Object.freeze({
  dbName: STREAM_ALIAS_DB_NAME,
  storeName: STREAM_ALIAS_STORE_NAME,
  version: STREAM_ALIAS_DB_VERSION,
});

export async function loadStreamDeviceAliases(userPreferenceKey: string): Promise<StreamDeviceAliases> {
  const record = await readIndexedDbRecord(STREAM_ALIAS_STORE_CONFIG, userPreferenceKey);
  return normalizeStreamPreferencesSnapshot(record).deviceAliases;
}

export async function saveStreamDeviceAliases(
  userPreferenceKey: string,
  aliases: StreamDeviceAliases,
): Promise<void> {
  const snapshot: StreamPreferencesSnapshot = normalizeStreamPreferencesSnapshot({ deviceAliases: aliases });
  await writeIndexedDbRecord(STREAM_ALIAS_STORE_CONFIG, userPreferenceKey, snapshot);
}

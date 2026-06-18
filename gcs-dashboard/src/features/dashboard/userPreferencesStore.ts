import {
  createDefaultDashboardUserPreferences,
  normalizeDashboardUserPreferences,
  type DashboardUserPreferences,
} from "./userPreferences";

export const DASHBOARD_PREFERENCES_DB_NAME = "gcs-saker-dashboard-preferences";
export const DASHBOARD_PREFERENCES_DB_VERSION = 1;
export const DASHBOARD_PREFERENCES_STORE_NAME = "userPreferences";

export async function loadDashboardUserPreferences(
  userPreferenceKey: string,
): Promise<DashboardUserPreferences> {
  const database = await openDashboardPreferencesDatabase();
  if (!database) return createDefaultDashboardUserPreferences();
  const record = await readPreferenceRecord(database, userPreferenceKey);
  database.close();
  return normalizeDashboardUserPreferences(record);
}

export async function saveDashboardUserPreferences(
  userPreferenceKey: string,
  preferences: DashboardUserPreferences,
): Promise<void> {
  const database = await openDashboardPreferencesDatabase();
  if (!database) return;
  await writePreferenceRecord(database, userPreferenceKey, preferences);
  database.close();
}

async function openDashboardPreferencesDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    const request = indexedDB.open(DASHBOARD_PREFERENCES_DB_NAME, DASHBOARD_PREFERENCES_DB_VERSION);
    request.onerror = () => resolve(null);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DASHBOARD_PREFERENCES_STORE_NAME)) {
        database.createObjectStore(DASHBOARD_PREFERENCES_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function readPreferenceRecord(database: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve) => {
    const transaction = database.transaction(DASHBOARD_PREFERENCES_STORE_NAME, "readonly");
    const store = transaction.objectStore(DASHBOARD_PREFERENCES_STORE_NAME);
    const request = store.get(key);
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
  });
}

async function writePreferenceRecord(
  database: IDBDatabase,
  key: string,
  preferences: DashboardUserPreferences,
): Promise<void> {
  return new Promise((resolve) => {
    const transaction = database.transaction(DASHBOARD_PREFERENCES_STORE_NAME, "readwrite");
    const store = transaction.objectStore(DASHBOARD_PREFERENCES_STORE_NAME);
    const request = store.put(preferences, key);
    request.onerror = () => resolve();
    request.onsuccess = () => resolve();
  });
}

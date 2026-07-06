import {
  createDefaultDashboardUserPreferences,
  normalizeDashboardUserPreferences,
  type DashboardUserPreferences,
} from "./userPreferences";
import {
  readIndexedDbRecord,
  writeIndexedDbRecord,
} from "./indexedDbStore";

export const DASHBOARD_PREFERENCES_DB_NAME = "gcs-saker-dashboard-preferences";
export const DASHBOARD_PREFERENCES_DB_VERSION = 1;
export const DASHBOARD_PREFERENCES_STORE_NAME = "userPreferences";

const DASHBOARD_PREFERENCES_STORE_CONFIG = Object.freeze({
  dbName: DASHBOARD_PREFERENCES_DB_NAME,
  storeName: DASHBOARD_PREFERENCES_STORE_NAME,
  version: DASHBOARD_PREFERENCES_DB_VERSION,
});

export interface BrowserPreferenceRepository {
  loadDashboardUserPreferences(userPreferenceKey: string): Promise<DashboardUserPreferences>;
  saveDashboardUserPreferences(userPreferenceKey: string, preferences: DashboardUserPreferences): Promise<void>;
}

export function createIndexedDbPreferenceRepository(): BrowserPreferenceRepository {
  return {
    loadDashboardUserPreferences,
    saveDashboardUserPreferences,
  };
}

export async function loadDashboardUserPreferences(
  userPreferenceKey: string,
): Promise<DashboardUserPreferences> {
  const record = await readIndexedDbRecord(DASHBOARD_PREFERENCES_STORE_CONFIG, userPreferenceKey);
  if (!record) return createDefaultDashboardUserPreferences();
  return migrateDashboardUserPreferencesRecord(record);
}

export async function saveDashboardUserPreferences(
  userPreferenceKey: string,
  preferences: DashboardUserPreferences,
): Promise<void> {
  await writeIndexedDbRecord(
    DASHBOARD_PREFERENCES_STORE_CONFIG,
    userPreferenceKey,
    sanitizeDashboardPreferencesForStorage(preferences),
  );
}

export function migrateDashboardUserPreferencesRecord(value: unknown): DashboardUserPreferences {
  return normalizeDashboardUserPreferences(value);
}

export function sanitizeDashboardPreferencesForStorage(value: unknown): DashboardUserPreferences {
  return normalizeDashboardUserPreferences(value);
}

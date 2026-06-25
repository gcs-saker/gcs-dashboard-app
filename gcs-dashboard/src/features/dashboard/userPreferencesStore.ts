export {
  DASHBOARD_PREFERENCES_DB_NAME,
  DASHBOARD_PREFERENCES_DB_VERSION,
  DASHBOARD_PREFERENCES_STORE_NAME,
  createIndexedDbPreferenceRepository,
  loadDashboardUserPreferences,
  migrateDashboardUserPreferencesRecord,
  sanitizeDashboardPreferencesForStorage,
  saveDashboardUserPreferences,
  type BrowserPreferenceRepository,
} from "./browserPreferenceRepository";

import { useCallback, useEffect, useRef } from "react";
import type { DashboardUserPreferences } from "@dashboard/preferences/userPreferences";
import { saveDashboardUserPreferences } from "@dashboard/preferences/userPreferencesStore";

export const DASHBOARD_PREFERENCE_SAVE_DEBOUNCE_MS = 400;

interface PendingPreferenceSave {
  readonly key: string;
  readonly preferences: DashboardUserPreferences;
}

export function useDebouncedPreferenceWriter(delayMs = DASHBOARD_PREFERENCE_SAVE_DEBOUNCE_MS) {
  const pendingSaveRef = useRef<PendingPreferenceSave | null>(null);
  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);

  const flushPendingSave = useCallback((): void => {
    const pendingSave = pendingSaveRef.current;
    if (!pendingSave) return;
    pendingSaveRef.current = null;
    void saveDashboardUserPreferences(pendingSave.key, pendingSave.preferences);
  }, []);

  const schedulePreferenceSave = useCallback((key: string, preferences: DashboardUserPreferences): void => {
    pendingSaveRef.current = { key, preferences };
    if (timerRef.current) globalThis.clearTimeout(timerRef.current);
    timerRef.current = globalThis.setTimeout(() => {
      timerRef.current = null;
      flushPendingSave();
    }, delayMs);
  }, [delayMs, flushPendingSave]);

  useEffect(() => () => {
    if (timerRef.current) globalThis.clearTimeout(timerRef.current);
    flushPendingSave();
  }, [flushPendingSave]);

  return { flushPendingSave, schedulePreferenceSave };
}

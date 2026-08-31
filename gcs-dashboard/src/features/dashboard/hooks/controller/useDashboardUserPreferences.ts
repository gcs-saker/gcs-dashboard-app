import { useEffect, useMemo, useRef, useState } from "react";
import { loadStreamDeviceAliases } from "@dashboard/assets/streamAliasRepository";
import { mergeDashboardPreferencesWithStreamAliases } from "@dashboard/preferences/dashboardPreferenceMerge";
import { useDebouncedPreferenceWriter } from "@/features/shared/hooks/useDebouncedPreferenceWriter";
import {
  createDashboardUserPreferenceKey,
  createDefaultDashboardUserPreferences,
  type DashboardUserPreferences,
} from "@dashboard/preferences/userPreferences";
import { loadDashboardUserPreferences } from "@dashboard/preferences/userPreferencesStore";
import { useDashboardPreferenceActions } from "./useDashboardPreferenceActions";

export function useDashboardUserPreferences(username: string | null | undefined) {
  const userPreferenceKey = useMemo(() => createDashboardUserPreferenceKey(username), [username]);
  const [preferences, setPreferencesState] = useState<DashboardUserPreferences>(() =>
    createDefaultDashboardUserPreferences(),
  );
  const mutationRevisionRef = useRef(0);
  const { schedulePreferenceSave } = useDebouncedPreferenceWriter();

  useEffect(() => {
    let disposed = false;
    const loadRevision = mutationRevisionRef.current;
    void Promise.all([
      loadDashboardUserPreferences(userPreferenceKey),
      loadStreamDeviceAliases(userPreferenceKey),
    ]).then(([storedPreferences, aliases]) => {
      if (!disposed && mutationRevisionRef.current === loadRevision) {
        setPreferencesState(mergeDashboardPreferencesWithStreamAliases(storedPreferences, aliases));
      }
    });
    return () => {
      disposed = true;
    };
  }, [userPreferenceKey]);

  const actions = useDashboardPreferenceActions({
    preferences, setPreferences: setPreferencesState, mutationRevisionRef,
    scheduleSave: schedulePreferenceSave, userPreferenceKey,
  });
  return { preferences, ...actions };
}

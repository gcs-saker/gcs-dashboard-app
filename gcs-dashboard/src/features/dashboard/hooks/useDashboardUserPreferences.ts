import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CctvQualityMode } from "../components/CctvChannelCard";
import type { DashboardLayoutItem, DashboardWidgetId } from "../dashboardLayout";
import type { MotionMode } from "../motionPreference";
import { setStreamDeviceAlias } from "../streamPreferences";
import {
  createDashboardUserPreferenceKey,
  createDefaultDashboardUserPreferences,
  type CctvLayoutMode,
  type DashboardUserPreferences,
  type DashboardView,
} from "../userPreferences";
import { loadDashboardUserPreferences, saveDashboardUserPreferences } from "../userPreferencesStore";

type LayoutUpdater = readonly DashboardLayoutItem[] | ((current: DashboardLayoutItem[]) => readonly DashboardLayoutItem[]);

export function useDashboardUserPreferences(username: string | null | undefined) {
  const userPreferenceKey = useMemo(() => createDashboardUserPreferenceKey(username), [username]);
  const [preferences, setPreferencesState] = useState<DashboardUserPreferences>(() =>
    createDefaultDashboardUserPreferences(),
  );
  const mutationRevisionRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    const loadRevision = mutationRevisionRef.current;
    void loadDashboardUserPreferences(userPreferenceKey).then((storedPreferences) => {
      if (!disposed && mutationRevisionRef.current === loadRevision) {
        setPreferencesState(storedPreferences);
      }
    });
    return () => {
      disposed = true;
    };
  }, [userPreferenceKey]);

  const updatePreferences = useCallback(
    (updater: (current: DashboardUserPreferences) => DashboardUserPreferences): void => {
      setPreferencesState((current) => {
        const next = updater(current);
        mutationRevisionRef.current += 1;
        void saveDashboardUserPreferences(userPreferenceKey, next);
        return next;
      });
    },
    [userPreferenceKey],
  );

  const setActiveView = useCallback(
    (activeView: DashboardView): void => updatePreferences((current) => ({ ...current, activeView })),
    [updatePreferences],
  );

  const setCctvLayoutMode = useCallback(
    (cctvLayoutMode: CctvLayoutMode): void => updatePreferences((current) => ({ ...current, cctvLayoutMode })),
    [updatePreferences],
  );

  const setCctvQualityMode = useCallback(
    (cctvQualityMode: CctvQualityMode): void => updatePreferences((current) => ({ ...current, cctvQualityMode })),
    [updatePreferences],
  );

  const setMotionMode = useCallback(
    (motionMode: MotionMode): void => updatePreferences((current) => ({ ...current, motionMode })),
    [updatePreferences],
  );

  const setLayout = useCallback(
    (layoutOrUpdater: LayoutUpdater): void =>
      updatePreferences((current) => {
        const layout = typeof layoutOrUpdater === "function"
          ? layoutOrUpdater([...current.layout])
          : layoutOrUpdater;
        return { ...current, layout: [...layout] };
      }),
    [updatePreferences],
  );

  const setStreamAlias = useCallback(
    (deviceId: string, alias: string): void =>
      updatePreferences((current) => ({
        ...current,
        streamPreferences: setStreamDeviceAlias(current.streamPreferences, deviceId, alias),
      })),
    [updatePreferences],
  );

  const resetWidgetLayout = useCallback(
    (layout: readonly DashboardLayoutItem[]): void =>
      updatePreferences((current) => ({ ...current, layout: [...layout] })),
    [updatePreferences],
  );

  const isWidgetPinned = useCallback(
    (widgetId: DashboardWidgetId): boolean => preferences.layout.find((item) => item.id === widgetId)?.pinned ?? false,
    [preferences.layout],
  );

  const isWidgetVisible = useCallback(
    (widgetId: DashboardWidgetId): boolean => preferences.layout.find((item) => item.id === widgetId)?.visible ?? false,
    [preferences.layout],
  );

  return {
    isWidgetPinned,
    isWidgetVisible,
    preferences,
    resetWidgetLayout,
    setActiveView,
    setCctvLayoutMode,
    setCctvQualityMode,
    setLayout,
    setMotionMode,
    setStreamAlias,
  };
}

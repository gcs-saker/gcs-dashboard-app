import { useCallback, useEffect, useMemo, useRef, useState,
  type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { CctvQualityMode } from "@dashboard/components/CctvChannelCard";
import type { DashboardLayoutItem, DashboardWidgetId } from "@dashboard/layout/dashboardLayout";
import type { MotionMode } from "@dashboard/preferences/motionPreference";
import { setStreamDeviceAlias } from "@dashboard/preferences/streamPreferences";
import { loadStreamDeviceAliases, saveStreamDeviceAliases } from "@dashboard/assets/streamAliasRepository";
import { mergeDashboardPreferencesWithStreamAliases } from "@dashboard/preferences/dashboardPreferenceMerge";
import { useDebouncedPreferenceWriter } from "@/features/shared/hooks/useDebouncedPreferenceWriter";
import {
  createDashboardUserPreferenceKey,
  createDefaultDashboardUserPreferences,
  type CctvLayoutMode,
  type DashboardUserPreferences,
  type DashboardView,
} from "@dashboard/preferences/userPreferences";
import { loadDashboardUserPreferences } from "@dashboard/preferences/userPreferencesStore";

type LayoutUpdater = readonly DashboardLayoutItem[] | ((current: DashboardLayoutItem[]) => readonly DashboardLayoutItem[]);

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

  const actions = usePreferenceActions(preferences, setPreferencesState, mutationRevisionRef,
    schedulePreferenceSave, userPreferenceKey);
  return { preferences, ...actions };
}

function usePreferenceActions(
  preferences: DashboardUserPreferences,
  setPreferencesState: Dispatch<SetStateAction<DashboardUserPreferences>>,
  mutationRevisionRef: MutableRefObject<number>,
  schedulePreferenceSave: ReturnType<typeof useDebouncedPreferenceWriter>["schedulePreferenceSave"],
  userPreferenceKey: string,
) {
  const updatePreferences = useCallback(
    (updater: (current: DashboardUserPreferences) => DashboardUserPreferences): void => {
      setPreferencesState((current) => {
        const next = updater(current);
        mutationRevisionRef.current += 1;
        schedulePreferenceSave(userPreferenceKey, next);
        return next;
      });
    },
    [mutationRevisionRef, schedulePreferenceSave, setPreferencesState, userPreferenceKey],
  );
  return { ...useSimplePreferenceSetters(updatePreferences),
    ...useLayoutPreferenceActions(updatePreferences),
    ...useStreamAliasAction(updatePreferences, userPreferenceKey),
    ...useWidgetPreferenceQueries(preferences),
  };
}

type PreferenceUpdater = (updater: (current: DashboardUserPreferences) => DashboardUserPreferences) => void;

function useSimplePreferenceSetters(updatePreferences: PreferenceUpdater) {
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

  return { setActiveView, setCctvLayoutMode, setCctvQualityMode, setMotionMode };
}

function useLayoutPreferenceActions(updatePreferences: PreferenceUpdater) {
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

  const resetWidgetLayout = useCallback(
    (layout: readonly DashboardLayoutItem[]): void =>
      updatePreferences((current) => ({ ...current, layout: [...layout] })),
    [updatePreferences],
  );
  return { resetWidgetLayout, setLayout };
}

function useStreamAliasAction(updatePreferences: PreferenceUpdater, userPreferenceKey: string) {
  const setStreamAlias = useCallback(
    (deviceId: string, alias: string): void =>
      updatePreferences((current) => {
        const streamPreferences = setStreamDeviceAlias(current.streamPreferences, deviceId, alias);
        void saveStreamDeviceAliases(userPreferenceKey, streamPreferences.deviceAliases);
        return { ...current, streamPreferences };
      }),
    [updatePreferences, userPreferenceKey],
  );

  return { setStreamAlias };
}

function useWidgetPreferenceQueries(preferences: DashboardUserPreferences) {
  const isWidgetPinned = useCallback(
    (widgetId: DashboardWidgetId): boolean => preferences.layout.find((item) => item.id === widgetId)?.pinned ?? false,
    [preferences.layout],
  );

  const isWidgetVisible = useCallback(
    (widgetId: DashboardWidgetId): boolean => preferences.layout.find((item) => item.id === widgetId)?.visible ?? false,
    [preferences.layout],
  );

  return { isWidgetPinned, isWidgetVisible };
}

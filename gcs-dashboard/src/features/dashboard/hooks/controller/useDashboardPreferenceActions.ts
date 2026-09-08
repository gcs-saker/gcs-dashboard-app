import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { CctvQualityMode } from "@dashboard/components/CctvChannelCard";
import type { DashboardLayoutItem, DashboardWidgetId } from "@dashboard/layout/dashboardLayout";
import type { MotionMode } from "@dashboard/preferences/motionPreference";
import { setStreamDeviceAlias } from "@dashboard/preferences/streamPreferences";
import { saveStreamDeviceAliases } from "@dashboard/assets/streamAliasRepository";
import type { CctvLayoutMode, DashboardDensityMode, DashboardPriorityMode, DashboardUserPreferences, DashboardView } from "@dashboard/preferences/userPreferences";
import type { useDebouncedPreferenceWriter } from "@/features/shared/hooks/useDebouncedPreferenceWriter";

interface PreferenceActionsInput {
  preferences: DashboardUserPreferences;
  setPreferences: Dispatch<SetStateAction<DashboardUserPreferences>>;
  mutationRevisionRef: MutableRefObject<number>;
  scheduleSave: ReturnType<typeof useDebouncedPreferenceWriter>["schedulePreferenceSave"];
  userPreferenceKey: string;
}

type PreferenceUpdater = (updater: (current: DashboardUserPreferences) => DashboardUserPreferences) => void;
type LayoutUpdater = readonly DashboardLayoutItem[] | ((current: DashboardLayoutItem[]) => readonly DashboardLayoutItem[]);

export function useDashboardPreferenceActions(input: PreferenceActionsInput) {
  const { mutationRevisionRef, preferences, scheduleSave, setPreferences, userPreferenceKey } = input;
  const updatePreferences = useCallback(
    (updater: (current: DashboardUserPreferences) => DashboardUserPreferences): void => {
      setPreferences((current) => {
        const next = updater(current);
        mutationRevisionRef.current += 1;
        scheduleSave(userPreferenceKey, next);
        return next;
      });
    },
    [mutationRevisionRef, scheduleSave, setPreferences, userPreferenceKey],
  );
  return { ...useSimplePreferenceSetters(updatePreferences), ...useLayoutPreferenceActions(updatePreferences),
    ...useStreamAliasAction(updatePreferences, userPreferenceKey), ...useWidgetQueries(preferences) };
}

function useSimplePreferenceSetters(update: PreferenceUpdater) {
  const setActiveView = useCallback((activeView: DashboardView) => update((value) => ({ ...value, activeView })), [update]);
  const setCctvLayoutMode = useCallback((cctvLayoutMode: CctvLayoutMode) => update((value) => ({ ...value, cctvLayoutMode })), [update]);
  const setCctvQualityMode = useCallback((cctvQualityMode: CctvQualityMode) => update((value) => ({ ...value, cctvQualityMode })), [update]);
  const setMotionMode = useCallback((motionMode: MotionMode) => update((value) => ({ ...value, motionMode })), [update]);
  const setDashboardDensityMode = useCallback((dashboardDensityMode: DashboardDensityMode) =>
    update((value) => ({ ...value, dashboardDensityMode })), [update]);
  const setDashboardPriorityMode = useCallback((dashboardPriorityMode: DashboardPriorityMode) =>
    update((value) => ({ ...value, dashboardPriorityMode })), [update]);
  return { setActiveView, setCctvLayoutMode, setCctvQualityMode, setDashboardDensityMode, setDashboardPriorityMode, setMotionMode };
}

function useLayoutPreferenceActions(update: PreferenceUpdater) {
  const setLayout = useCallback((next: LayoutUpdater) => update((current) => ({
    ...current, layout: [...(typeof next === "function" ? next([...current.layout]) : next)],
  })), [update]);
  const resetWidgetLayout = useCallback((layout: readonly DashboardLayoutItem[]) =>
    update((current) => ({ ...current, layout: [...layout] })), [update]);
  return { resetWidgetLayout, setLayout };
}

function useStreamAliasAction(update: PreferenceUpdater, preferenceKey: string) {
  const setStreamAlias = useCallback((deviceId: string, alias: string) => update((current) => {
    const streamPreferences = setStreamDeviceAlias(current.streamPreferences, deviceId, alias);
    void saveStreamDeviceAliases(preferenceKey, streamPreferences.deviceAliases);
    return { ...current, streamPreferences };
  }), [preferenceKey, update]);
  return { setStreamAlias };
}

function useWidgetQueries(preferences: DashboardUserPreferences) {
  const isWidgetPinned = useCallback((id: DashboardWidgetId) =>
    preferences.layout.find((item) => item.id === id)?.pinned ?? false, [preferences.layout]);
  const isWidgetVisible = useCallback((id: DashboardWidgetId) =>
    preferences.layout.find((item) => item.id === id)?.visible ?? false, [preferences.layout]);
  return { isWidgetPinned, isWidgetVisible };
}

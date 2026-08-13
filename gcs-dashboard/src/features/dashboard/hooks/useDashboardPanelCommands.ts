import { useCallback } from "react";
import type { DashboardWidgetId } from "@dashboard/dashboardLayout";
import type { useDashboardLocalUiState } from "./useDashboardLocalUiState";
import type { useDashboardPageActions } from "./useDashboardPageActions";
import type { useDashboardUserPreferences } from "./useDashboardUserPreferences";

interface DashboardPanelCommandsInput {
  actions: ReturnType<typeof useDashboardPageActions>;
  preferences: ReturnType<typeof useDashboardUserPreferences>;
  ui: ReturnType<typeof useDashboardLocalUiState>;
}

export function useDashboardPanelCommands({ actions, preferences, ui }: DashboardPanelCommandsInput) {
  const { setIsAssetDrawerOpen, setIsWidgetDialogOpen, setPopoutWidgetId } = ui;
  const panelClass = useCallback(
    (baseClass: string, widgetId: DashboardWidgetId): string =>
      `${baseClass} ${preferences.isWidgetPinned(widgetId) ? "is-pinned" : ""}`,
    [preferences],
  );
  const openAssetDrawer = useCallback(() => setIsAssetDrawerOpen(true), [setIsAssetDrawerOpen]);
  const openWidgetDialog = useCallback(() => setIsWidgetDialogOpen(true), [setIsWidgetDialogOpen]);
  const closePopout = useCallback(() => setPopoutWidgetId(null), [setPopoutWidgetId]);
  const hideWidget = useCallback(
    (widgetId: DashboardWidgetId) => actions.setWidgetVisible(widgetId, false),
    [actions],
  );
  return { closePopout, hideWidget, openAssetDrawer, openWidgetDialog, panelClass };
}

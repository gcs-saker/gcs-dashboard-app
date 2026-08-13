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
  const panelClass = useCallback(
    (baseClass: string, widgetId: DashboardWidgetId): string =>
      `${baseClass} ${preferences.isWidgetPinned(widgetId) ? "is-pinned" : ""}`,
    [preferences],
  );
  const openAssetDrawer = useCallback(() => ui.setIsAssetDrawerOpen(true), [ui.setIsAssetDrawerOpen]);
  const openWidgetDialog = useCallback(() => ui.setIsWidgetDialogOpen(true), [ui.setIsWidgetDialogOpen]);
  const closePopout = useCallback(() => ui.setPopoutWidgetId(null), [ui.setPopoutWidgetId]);
  const hideWidget = useCallback(
    (widgetId: DashboardWidgetId) => actions.setWidgetVisible(widgetId, false),
    [actions],
  );
  return { closePopout, hideWidget, openAssetDrawer, openWidgetDialog, panelClass };
}

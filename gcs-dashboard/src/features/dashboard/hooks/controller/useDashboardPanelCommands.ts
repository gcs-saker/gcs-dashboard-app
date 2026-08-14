import { useCallback } from "react";
import type { DashboardWidgetId } from "@dashboard/layout/dashboardLayout";
import type { useDashboardLocalUiState } from "@dashboard/hooks/controller/useDashboardLocalUiState";
import type { useDashboardPageActions } from "@dashboard/hooks/controller/useDashboardPageActions";
import type { useDashboardUserPreferences } from "@dashboard/hooks/controller/useDashboardUserPreferences";

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

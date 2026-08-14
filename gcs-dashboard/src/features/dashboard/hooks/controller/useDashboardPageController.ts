import { useCallback, useMemo } from "react";
import { RENDER_DIAGNOSTIC_LABELS, useRenderDiagnostics } from "@features/renderDiagnostics";
import type { DashboardPageViewProps } from "@dashboard/components/templates/DashboardPageView";
import { buildDashboardPageViewModel } from "@dashboard/layout/dashboardPageViewModel";
import { useDashboardChunkPreload } from "@dashboard/hooks/controller/useDashboardChunkPreload";
import { useDashboardAuthNavigation } from "@dashboard/hooks/controller/useDashboardAuthNavigation";
import { useDashboardLocalUiState } from "@dashboard/hooks/controller/useDashboardLocalUiState";
import { useDashboardMotionMode } from "@dashboard/hooks/controller/useDashboardMotionMode";
import { useDashboardPageActionInput } from "@dashboard/hooks/controller/useDashboardPageActionInput";
import { useDashboardPageActions } from "@dashboard/hooks/controller/useDashboardPageActions";
import { useDashboardPageViewProps } from "@dashboard/hooks/controller/useDashboardPageViewProps";
import { useDashboardPanelCommands } from "@dashboard/hooks/controller/useDashboardPanelCommands";
import { useDashboardStreams } from "@dashboard/hooks/controller/useDashboardStreams";
import { useDashboardUserPreferences } from "@dashboard/hooks/controller/useDashboardUserPreferences";
import { useStreamAvailabilityNotification } from "@dashboard/hooks/shared/useStreamAvailabilityNotification";
import { useAccessibleGroupInventory } from "@dashboard/hooks/assets/useAccessibleGroupInventory";
export function useDashboardPageController(): DashboardPageViewProps {
  useRenderDiagnostics(RENDER_DIAGNOSTIC_LABELS.dashboardPageController);
  const { currentUser, handleAuthFailure, handleLogout } = useDashboardAuthNavigation();
  const ui = useDashboardLocalUiState();
  const preferencesApi = useDashboardUserPreferences(currentUser?.username);
  const groupInventory = useAccessibleGroupInventory(currentUser?.username ?? "");
  const { motionMode } = preferencesApi.preferences;

  const streamState = useDashboardStreams({
    onAuthFailure: handleAuthFailure,
    onStreamDeviceAliasChange: preferencesApi.setStreamAlias,
    streamPreferences: preferencesApi.preferences.streamPreferences,
  });
  const viewModel = useMemo(() => buildDashboardPageViewModel({
    preferences: preferencesApi.preferences,
    selectedStream: streamState.selectedStream,
    streams: streamState.streams,
    groupInventory,
  }), [groupInventory, preferencesApi.preferences, streamState.selectedStream, streamState.streams]);
  const [notification, setNotification] = useStreamAvailabilityNotification(streamState.streams);
  useDashboardChunkPreload();
  useDashboardMotionMode(motionMode);

  const dismissNotification = useCallback((): void => setNotification(null), [setNotification]);
  const actionInput = useDashboardPageActionInput(preferencesApi, streamState, ui);
  const actions = useDashboardPageActions(actionInput);
  const { closePopout, hideWidget, openAssetDrawer, openWidgetDialog, panelClass } =
    useDashboardPanelCommands({ actions, preferences: preferencesApi, ui });

  return useDashboardPageViewProps({
    actions,
    auth: { currentUser, handleAuthFailure, handleLogout },
    commands: { closePopout, hideWidget, openAssetDrawer, openWidgetDialog, panelClass },
    notification,
    onDismissNotification: dismissNotification,
    preferences: preferencesApi,
    streams: streamState,
    ui,
    viewModel,
  });
}

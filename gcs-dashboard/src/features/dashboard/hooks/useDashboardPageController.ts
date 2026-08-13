import { useCallback, useMemo } from "react";
import { RENDER_DIAGNOSTIC_LABELS, useRenderDiagnostics } from "@features/renderDiagnostics";
import type { DashboardPageViewProps } from "@dashboard/components/templates/DashboardPageView";
import { buildDashboardPageViewModel } from "@dashboard/dashboardPageViewModel";
import { useDashboardChunkPreload } from "./useDashboardChunkPreload";
import { useDashboardAuthNavigation } from "./useDashboardAuthNavigation";
import { useDashboardLocalUiState } from "./useDashboardLocalUiState";
import { useDashboardMotionMode } from "./useDashboardMotionMode";
import { useDashboardPageActionInput } from "./useDashboardPageActionInput";
import { useDashboardPageActions } from "./useDashboardPageActions";
import { useDashboardPageViewProps } from "./useDashboardPageViewProps";
import { useDashboardPanelCommands } from "./useDashboardPanelCommands";
import { useDashboardStreams } from "./useDashboardStreams";
import { useDashboardUserPreferences } from "./useDashboardUserPreferences";
import { useStreamAvailabilityNotification } from "./useStreamAvailabilityNotification";
export function useDashboardPageController(): DashboardPageViewProps {
  useRenderDiagnostics(RENDER_DIAGNOSTIC_LABELS.dashboardPageController);
  const { currentUser, handleAuthFailure, handleLogout } = useDashboardAuthNavigation();
  const ui = useDashboardLocalUiState();
  const preferencesApi = useDashboardUserPreferences(currentUser?.username);
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
  }), [preferencesApi.preferences, streamState.selectedStream, streamState.streams]);
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

import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@auth/AuthProvider";
import { RENDER_DIAGNOSTIC_LABELS, useRenderDiagnostics } from "@features/renderDiagnostics";
import type { DashboardPageViewProps } from "@dashboard/components/templates/DashboardPageView";
import { getDashboardWidgetDefinition, setDashboardWidgetVisible, type DashboardWidgetId } from "@dashboard/dashboardLayout";
import { buildDashboardPageViewModel } from "@dashboard/dashboardPageViewModel";
import { useDashboardChunkPreload } from "./useDashboardChunkPreload";
import { useDashboardLocalUiState } from "./useDashboardLocalUiState";
import { useDashboardMotionMode } from "./useDashboardMotionMode";
import { useDashboardPageActionInput } from "./useDashboardPageActionInput";
import { useDashboardPageActions } from "./useDashboardPageActions";
import { useDashboardStreams } from "./useDashboardStreams";
import { useDashboardUserPreferences } from "./useDashboardUserPreferences";
import { useStreamAvailabilityNotification } from "./useStreamAvailabilityNotification";
export function useDashboardPageController(): DashboardPageViewProps {
  useRenderDiagnostics(RENDER_DIAGNOSTIC_LABELS.dashboardPageController);
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const ui = useDashboardLocalUiState();
  const preferencesApi = useDashboardUserPreferences(currentUser?.username);
  const { activeView, cctvLayoutMode, cctvQualityMode, layout, motionMode } = preferencesApi.preferences;
  const handleAuthFailure = useCallback((): void => {
    logout();
    navigate("/login?reason=session-expired", { replace: true });
  }, [logout, navigate]);
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
  const revealDetectedStream = useCallback((streamId: string): void => {
    streamState.selectStream(streamId);
    if (activeView === "dashboard") {
      preferencesApi.setLayout((current) => setDashboardWidgetVisible(current, "selected-stream", true));
    }
  }, [activeView, preferencesApi.setLayout, streamState.selectStream]);
  const [notification, setNotification] = useStreamAvailabilityNotification(streamState.streams, revealDetectedStream);
  useDashboardChunkPreload();
  useDashboardMotionMode(motionMode);
  const panelClass = useCallback(
    (baseClass: string, widgetId: DashboardWidgetId): string => `${baseClass} ${preferencesApi.isWidgetPinned(widgetId) ? "is-pinned" : ""}`,
    [preferencesApi],
  );
  const handleLogout = useCallback((): void => {
    logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);
  const openAssetDrawer = useCallback((): void => ui.setIsAssetDrawerOpen(true), [ui.setIsAssetDrawerOpen]);
  const openWidgetDialog = useCallback((): void => ui.setIsWidgetDialogOpen(true), [ui.setIsWidgetDialogOpen]);
  const dismissNotification = useCallback((): void => setNotification(null), [setNotification]);
  const openNotification = useCallback((streamId: string): void => {
    streamState.selectStream(streamId);
    preferencesApi.setActiveView("dashboard");
    preferencesApi.setLayout((current) => setDashboardWidgetVisible(current, "selected-stream", true));
    setNotification(null);
  }, [preferencesApi.setActiveView, preferencesApi.setLayout, setNotification, streamState.selectStream]);
  const closePopout = useCallback((): void => ui.setPopoutWidgetId(null), [ui.setPopoutWidgetId]);
  const actionInput = useDashboardPageActionInput(preferencesApi, streamState, ui);
  const actions = useDashboardPageActions(actionInput);
  const hideWidget = useCallback((widgetId: DashboardWidgetId): void => actions.setWidgetVisible(widgetId, false), [actions]);
  return {
    headerProps: {
      activeView,
      currentUser,
      isAssetDrawerOpen: ui.isAssetDrawerOpen,
      layoutMessage: ui.layoutMessage,
      onChangeView: preferencesApi.setActiveView,
      onLogout: handleLogout,
      onOpenAssetDrawer: openAssetDrawer,
      onOpenWidgetDialog: openWidgetDialog,
      onResetLayout: actions.resetLayout,
      streams: streamState.streams,
      selectedStreamId: streamState.selectedStreamId,
      talkbackTargetStreamIds: ui.talkbackTargetStreamIds,
    },
    motionMode,
    notification,
    onDismissNotification: dismissNotification,
    onOpenNotification: openNotification,
    routerProps: {
      activeView,
      aiResultsWidget: getDashboardWidgetDefinition("ai-results"),
      audioActiveStreamId: ui.audioActiveStreamId,
      audioAnalysis: ui.audioAnalysis,
      cctvGridSize: viewModel.cctvGridSize,
      cctvLayoutMode,
      cctvQualityMode,
      cctvStatusSummary: viewModel.cctvStatusSummary,
      cctvStreams: viewModel.cctvStreams,
      isWidgetPinned: preferencesApi.isWidgetPinned,
      isWidgetVisible: preferencesApi.isWidgetVisible,
      mapFocus: viewModel.mapFocus,
      motionEnabled: viewModel.motionEnabled,
      motionMode,
      onAuthFailure: handleAuthFailure,
      onMotionModeChange: preferencesApi.setMotionMode,
      onPlaybackStatusChange: actions.handleSelectedPlaybackStatusChange,
      onSelectMapStream: actions.selectMapStream,
      onSelectStream: actions.openStreamConnection,
      onSetCctvLayoutMode: preferencesApi.setCctvLayoutMode,
      onSetCctvQualityMode: preferencesApi.setCctvQualityMode,
      onToggleAiMode: actions.toggleStreamAiMode,
      onToggleTalkbackTarget: actions.toggleTalkbackTarget,
      opsSummaryWidget: getDashboardWidgetDefinition("ops-summary"),
      panelClass,
      selectedStream: streamState.selectedStream,
      selectedStreamId: streamState.selectedStreamId,
      streams: streamState.streams,
      tacticalMapWidget: getDashboardWidgetDefinition("tactical-map"),
      talkbackTargetStreamIds: ui.talkbackTargetStreamIds,
      telemetryRows: viewModel.telemetryRows,
      telemetryWidget: getDashboardWidgetDefinition("telemetry-panel"),
    },
    overlayProps: {
      assetTreeRoot: viewModel.assetTreeRoot,
      assetTreeWidget: getDashboardWidgetDefinition("asset-tree"),
      editingStream: streamState.editingStream,
      isAssetDrawerOpen: ui.isAssetDrawerOpen,
      isAssetTreeVisible: preferencesApi.isWidgetVisible("asset-tree"),
      isDashboardActive: activeView === "dashboard",
      isWidgetDialogOpen: ui.isWidgetDialogOpen,
      layout,
      onApplyWidgetDialog: actions.applyWidgetDialog,
      onCancelStreamConnection: actions.cancelStreamConnection,
      onCancelWidgetDialog: actions.cancelWidgetDialog,
      onCloseAssetDrawer: actions.closeAssetDrawer,
      onClosePopout: closePopout,
      onConnectDevice: actions.connectStreamDevice,
      onDisconnectStream: actions.disconnectCurrentStreamSlot,
      onResetLayout: actions.resetLayout,
      onSelectAssetTreeStream: actions.selectAssetTreeStream,
      onToggleWidget: actions.setWidgetVisible,
      panelClass,
      popoutWidget: ui.popoutWidgetId ? getDashboardWidgetDefinition(ui.popoutWidgetId) : null,
      streamDevices: streamState.streamDevices,
    },
    widgetControls: {
      isWidgetPinned: preferencesApi.isWidgetPinned,
      onHideWidget: hideWidget,
      onPopOutWidget: ui.setPopoutWidgetId,
      onToggleWidgetPin: actions.toggleWidgetPin,
    },
  };
}

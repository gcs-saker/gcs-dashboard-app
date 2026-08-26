import type { DashboardPageViewProps } from "@dashboard/components/templates/DashboardPageView";
import { getDashboardWidgetDefinition } from "@dashboard/layout/dashboardLayout";
import type { buildDashboardPageViewModel } from "@dashboard/layout/dashboardPageViewModel";
import type { useDashboardAuthNavigation } from "@dashboard/hooks/controller/useDashboardAuthNavigation";
import type { useDashboardLocalUiState } from "@dashboard/hooks/controller/useDashboardLocalUiState";
import type { useDashboardPageActions } from "@dashboard/hooks/controller/useDashboardPageActions";
import type { useDashboardPanelCommands } from "@dashboard/hooks/controller/useDashboardPanelCommands";
import type { useDashboardStreams } from "@dashboard/hooks/controller/useDashboardStreams";
import type { useDashboardUserPreferences } from "@dashboard/hooks/controller/useDashboardUserPreferences";

interface DashboardPageViewPropsInput {
  actions: ReturnType<typeof useDashboardPageActions>;
  auth: ReturnType<typeof useDashboardAuthNavigation>;
  commands: ReturnType<typeof useDashboardPanelCommands>;
  notification: DashboardPageViewProps["notification"];
  onDismissNotification: DashboardPageViewProps["onDismissNotification"];
  preferences: ReturnType<typeof useDashboardUserPreferences>;
  streams: ReturnType<typeof useDashboardStreams>;
  ui: ReturnType<typeof useDashboardLocalUiState>;
  viewModel: ReturnType<typeof buildDashboardPageViewModel>;
}

export function useDashboardPageViewProps({
  actions, auth, commands, notification, onDismissNotification, preferences, streams, ui, viewModel,
}: DashboardPageViewPropsInput): DashboardPageViewProps {
  const { activeView: preferredView, cctvLayoutMode, cctvQualityMode, dashboardDensityMode, dashboardPriorityMode, layout, motionMode } = preferences.preferences;
  const activeView = preferredView === "events" && auth.currentUser?.role !== "admin" ? "dashboard" : preferredView;
  return {
    headerProps: {
      activeView, currentUser: auth.currentUser, isAssetDrawerOpen: ui.isAssetDrawerOpen,
      onChangeView: preferences.setActiveView, onLogout: auth.handleLogout,
      dashboardDensityMode, dashboardPriorityMode,
      onSetDashboardDensityMode: preferences.setDashboardDensityMode,
      onSetDashboardPriorityMode: preferences.setDashboardPriorityMode,
      onOpenAssetDrawer: commands.openAssetDrawer,
      onResetLayout: actions.resetLayout, streams: streams.streams, selectedStreamId: streams.selectedStreamId,
      talkbackTargetStreamIds: ui.talkbackTargetStreamIds,
    },
    dashboardDensityMode, dashboardPriorityMode, motionMode, notification, onDismissNotification,
    routerProps: {
      activeView, aiResultsWidget: getDashboardWidgetDefinition("ai-results"), dashboardDensityMode,
      audioActiveStreamId: ui.audioActiveStreamId, audioAnalysis: ui.audioAnalysis,
      cctvGridSize: viewModel.cctvGridSize, cctvLayoutMode, cctvQualityMode,
      cctvStatusSummary: viewModel.cctvStatusSummary, cctvStreams: viewModel.cctvStreams,
      isWidgetPinned: preferences.isWidgetPinned, isWidgetVisible: preferences.isWidgetVisible,
      mapFocus: viewModel.mapFocus, motionEnabled: viewModel.motionEnabled, motionMode,
      onAuthFailure: auth.handleAuthFailure, onMotionModeChange: preferences.setMotionMode,
      onPlaybackStatusChange: actions.handleSelectedPlaybackStatusChange,
      onSelectMapStream: actions.selectMapStream, onSelectStream: actions.openStreamConnection,
      onSetCctvLayoutMode: preferences.setCctvLayoutMode, onSetCctvQualityMode: preferences.setCctvQualityMode,
      onToggleAiMode: actions.toggleStreamAiMode, onToggleTalkbackTarget: actions.toggleTalkbackTarget,
      opsSummaryWidget: getDashboardWidgetDefinition("ops-summary"), panelClass: commands.panelClass,
      selectedStream: streams.selectedStream, selectedStreamId: streams.selectedStreamId, streams: streams.streams,
      tacticalMapWidget: getDashboardWidgetDefinition("tactical-map"),
      talkbackTargetStreamIds: ui.talkbackTargetStreamIds, telemetryRows: viewModel.telemetryRows,
      telemetryWidget: getDashboardWidgetDefinition("telemetry-panel"),
    },
    overlayProps: {
      assetTreeRoot: viewModel.assetTreeRoot, assetTreeWidget: getDashboardWidgetDefinition("asset-tree"),
      editingStream: streams.editingStream, isAssetDrawerOpen: ui.isAssetDrawerOpen,
      isAssetTreeVisible: preferences.isWidgetVisible("asset-tree"), isDashboardActive: activeView === "dashboard",
      isWidgetDialogOpen: ui.isWidgetDialogOpen, layout, onApplyWidgetDialog: actions.applyWidgetDialog,
      onCancelStreamConnection: actions.cancelStreamConnection, onCancelWidgetDialog: actions.cancelWidgetDialog,
      onCloseAssetDrawer: actions.closeAssetDrawer, onClosePopout: commands.closePopout,
      onConnectDevice: actions.connectStreamDevice, onDisconnectStream: actions.disconnectCurrentStreamSlot,
      onResetLayout: actions.resetLayout, onSelectAssetTreeStream: actions.selectAssetTreeStream,
      onSetDeviceAlias: preferences.setStreamAlias,
      onToggleWidget: actions.setWidgetVisible, panelClass: commands.panelClass,
      popoutWidget: ui.popoutWidgetId ? getDashboardWidgetDefinition(ui.popoutWidgetId) : null,
      streamDevices: streams.streamDevices,
    },
    widgetControls: {
      isWidgetPinned: preferences.isWidgetPinned, onHideWidget: commands.hideWidget,
      onPopOutWidget: ui.setPopoutWidgetId, onToggleWidgetPin: actions.toggleWidgetPin,
    },
  };
}

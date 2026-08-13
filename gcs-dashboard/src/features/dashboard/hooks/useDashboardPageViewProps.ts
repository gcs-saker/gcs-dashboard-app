import type { DashboardPageViewProps } from "@dashboard/components/templates/DashboardPageView";
import { getDashboardWidgetDefinition } from "@dashboard/dashboardLayout";
import type { buildDashboardPageViewModel } from "@dashboard/dashboardPageViewModel";
import type { useDashboardAuthNavigation } from "./useDashboardAuthNavigation";
import type { useDashboardLocalUiState } from "./useDashboardLocalUiState";
import type { useDashboardPageActions } from "./useDashboardPageActions";
import type { useDashboardPanelCommands } from "./useDashboardPanelCommands";
import type { useDashboardStreams } from "./useDashboardStreams";
import type { useDashboardUserPreferences } from "./useDashboardUserPreferences";

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
  const { activeView, cctvLayoutMode, cctvQualityMode, layout, motionMode } = preferences.preferences;
  return {
    headerProps: {
      activeView, currentUser: auth.currentUser, isAssetDrawerOpen: ui.isAssetDrawerOpen,
      layoutMessage: ui.layoutMessage, onChangeView: preferences.setActiveView, onLogout: auth.handleLogout,
      onOpenAssetDrawer: commands.openAssetDrawer, onOpenWidgetDialog: commands.openWidgetDialog,
      onResetLayout: actions.resetLayout, streams: streams.streams, selectedStreamId: streams.selectedStreamId,
      talkbackTargetStreamIds: ui.talkbackTargetStreamIds,
    },
    motionMode, notification, onDismissNotification,
    routerProps: {
      activeView, aiResultsWidget: getDashboardWidgetDefinition("ai-results"),
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
      canRenameDevices: auth.currentUser?.role === "admin", currentUsername: auth.currentUser?.username ?? "",
      editingStream: streams.editingStream, isAssetDrawerOpen: ui.isAssetDrawerOpen,
      isAssetTreeVisible: preferences.isWidgetVisible("asset-tree"), isDashboardActive: activeView === "dashboard",
      isWidgetDialogOpen: ui.isWidgetDialogOpen, layout, onApplyWidgetDialog: actions.applyWidgetDialog,
      onCancelStreamConnection: actions.cancelStreamConnection, onCancelWidgetDialog: actions.cancelWidgetDialog,
      onCloseAssetDrawer: actions.closeAssetDrawer, onClosePopout: commands.closePopout,
      onConnectDevice: actions.connectStreamDevice, onDisconnectStream: actions.disconnectCurrentStreamSlot,
      onResetLayout: actions.resetLayout, onSelectAssetTreeStream: actions.selectAssetTreeStream,
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

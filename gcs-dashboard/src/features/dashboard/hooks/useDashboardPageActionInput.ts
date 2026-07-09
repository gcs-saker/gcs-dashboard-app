import { useMemo } from "react";
import type { DashboardPageActionInput } from "./useDashboardPageActions";
import type { useDashboardLocalUiState } from "./useDashboardLocalUiState";
import type { useDashboardStreams } from "./useDashboardStreams";
import type { useDashboardUserPreferences } from "./useDashboardUserPreferences";

type DashboardLocalUiState = ReturnType<typeof useDashboardLocalUiState>;
type DashboardStreamState = ReturnType<typeof useDashboardStreams>;
type DashboardPreferencesApi = ReturnType<typeof useDashboardUserPreferences>;

export function useDashboardPageActionInput(
  preferencesApi: DashboardPreferencesApi,
  streamState: DashboardStreamState,
  ui: DashboardLocalUiState,
): DashboardPageActionInput {
  return useMemo(() => ({
    connectManualStreamAddress: streamState.connectManualStreamAddress,
    connectStreamDeviceState: streamState.connectStreamDevice,
    disconnectCurrentStreamSlotState: streamState.disconnectCurrentStreamSlot,
    isWidgetPinned: preferencesApi.isWidgetPinned,
    openStreamConnectionState: streamState.openStreamConnection,
    resetWidgetLayout: preferencesApi.resetWidgetLayout,
    selectStreamState: streamState.selectStream,
    setAudioActiveStreamId: ui.setAudioActiveStreamId,
    setAudioAnalysis: ui.setAudioAnalysis,
    setEditingStreamId: streamState.setEditingStreamId,
    setIsAssetDrawerOpen: ui.setIsAssetDrawerOpen,
    setIsWidgetDialogOpen: ui.setIsWidgetDialogOpen,
    setLayout: preferencesApi.setLayout,
    setLayoutMessage: ui.setLayoutMessage,
    setPopoutWidgetId: ui.setPopoutWidgetId,
    setTalkbackTargetStreamIds: ui.setTalkbackTargetStreamIds,
    streams: streamState.streams,
    toggleStreamAiModeState: streamState.toggleStreamAiMode,
  }), [
    preferencesApi.isWidgetPinned,
    preferencesApi.resetWidgetLayout,
    preferencesApi.setLayout,
    streamState.connectManualStreamAddress,
    streamState.connectStreamDevice,
    streamState.disconnectCurrentStreamSlot,
    streamState.openStreamConnection,
    streamState.selectStream,
    streamState.setEditingStreamId,
    streamState.streams,
    streamState.toggleStreamAiMode,
    ui.setAudioActiveStreamId,
    ui.setAudioAnalysis,
    ui.setIsAssetDrawerOpen,
    ui.setIsWidgetDialogOpen,
    ui.setLayoutMessage,
    ui.setPopoutWidgetId,
    ui.setTalkbackTargetStreamIds,
  ]);
}

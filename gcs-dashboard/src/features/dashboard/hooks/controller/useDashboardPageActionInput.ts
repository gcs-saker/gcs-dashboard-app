import { useMemo } from "react";
import type { DashboardPageActionInput } from "@dashboard/hooks/controller/useDashboardPageActions";
import type { useDashboardLocalUiState } from "@dashboard/hooks/controller/useDashboardLocalUiState";
import type { useDashboardStreams } from "@dashboard/hooks/controller/useDashboardStreams";
import type { useDashboardUserPreferences } from "@dashboard/hooks/controller/useDashboardUserPreferences";

type DashboardLocalUiState = ReturnType<typeof useDashboardLocalUiState>;
type DashboardStreamState = ReturnType<typeof useDashboardStreams>;
type DashboardPreferencesApi = ReturnType<typeof useDashboardUserPreferences>;

export function useDashboardPageActionInput(
  preferencesApi: DashboardPreferencesApi,
  streamState: DashboardStreamState,
  ui: DashboardLocalUiState,
): DashboardPageActionInput {
  return useMemo(() => ({
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

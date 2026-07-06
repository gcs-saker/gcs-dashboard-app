import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type { RealtimePlayerSnapshot } from "@streaming/types";
import {
  resetDashboardLayout,
  setDashboardWidgetPinned,
  setDashboardWidgetVisible,
  type DashboardLayoutItem,
  type DashboardWidgetId,
} from "@dashboard/dashboardLayout";
import type { AudioAnalysisSnapshot } from "@dashboard/dashboardPresentation";
import {
  nextAudioActiveStreamId,
  nextAudioAnalysisState,
  toggleStringSetItem,
} from "@dashboard/dashboardPageViewModel";
import type { StreamDeviceOption } from "@dashboard/streamDevices";
import type { DashboardStreamSlot } from "@dashboard/streamTypes";

export interface DashboardPageActionInput {
  connectManualStreamAddress: (address: string, displayName: string) => void;
  connectStreamDeviceState: (device: StreamDeviceOption) => void;
  disconnectCurrentStreamSlotState: () => void;
  isWidgetPinned: (widgetId: DashboardWidgetId) => boolean;
  openStreamConnectionState: (streamId: string) => void;
  resetWidgetLayout: (layout: DashboardLayoutItem[]) => void;
  selectStreamState: (streamId: string) => void;
  setAudioActiveStreamId: Dispatch<SetStateAction<string | null>>;
  setAudioAnalysis: Dispatch<SetStateAction<AudioAnalysisSnapshot | null>>;
  setEditingStreamId: (streamId: string | null) => void;
  setIsAssetDrawerOpen: Dispatch<SetStateAction<boolean>>;
  setIsWidgetDialogOpen: Dispatch<SetStateAction<boolean>>;
  setLayout: Dispatch<SetStateAction<DashboardLayoutItem[]>>;
  setLayoutMessage: Dispatch<SetStateAction<string>>;
  setPopoutWidgetId: Dispatch<SetStateAction<DashboardWidgetId | null>>;
  setTalkbackTargetStreamIds: Dispatch<SetStateAction<string[]>>;
  streams: DashboardStreamSlot[];
  toggleStreamAiModeState: (streamId: string) => void;
}

export function useDashboardPageActions(input: DashboardPageActionInput) {
  const toggleWidgetPin = useCallback((widgetId: DashboardWidgetId): void => {
    const nextPinned = !input.isWidgetPinned(widgetId);
    input.setLayout((current) => setDashboardWidgetPinned(current, widgetId, nextPinned));
    input.setLayoutMessage(nextPinned ? "위젯 고정됨" : "위젯 고정 해제됨");
  }, [input]);

  const setWidgetVisible = useCallback((widgetId: DashboardWidgetId, visible: boolean): void => {
    input.setLayout((current) => setDashboardWidgetVisible(current, widgetId, visible));
    input.setLayoutMessage(visible ? "위젯 표시됨" : "위젯 숨김");
  }, [input]);

  const resetLayout = useCallback((): void => {
    input.resetWidgetLayout(resetDashboardLayout());
    input.setPopoutWidgetId(null);
    input.setLayoutMessage("기본 레이아웃으로 초기화됨");
  }, [input]);

  const openStreamConnection = useCallback((streamId: string): void => {
    input.openStreamConnectionState(streamId);
    input.setLayoutMessage("스트림 슬롯 선택됨");
  }, [input]);

  const selectMapStream = useCallback((streamId: string): void => {
    input.selectStreamState(streamId);
    input.setLayoutMessage("지도 핀 스트림 선택됨");
  }, [input]);

  const selectAssetTreeStream = useCallback((streamId: string): void => {
    input.selectStreamState(streamId);
    input.setIsAssetDrawerOpen(false);
    input.setLayoutMessage("자산트리 스트림 선택됨");
  }, [input]);

  const connectStreamDevice = useCallback((device: StreamDeviceOption): void => {
    input.connectStreamDeviceState(device);
    input.setLayoutMessage("스트리밍 장비 연결됨");
  }, [input]);

  const connectStreamAddress = useCallback((address: string, displayName: string): void => {
    input.connectManualStreamAddress(address, displayName);
    input.setLayoutMessage("스트리밍 주소 연결됨");
  }, [input]);

  const disconnectCurrentStreamSlot = useCallback((): void => {
    input.disconnectCurrentStreamSlotState();
    input.setLayoutMessage("스트리밍 장비 연결 해제됨");
  }, [input]);

  const toggleStreamAiMode = useCallback((streamId: string): void => {
    input.toggleStreamAiModeState(streamId);
    input.setLayoutMessage("AI 모드 옵션 변경됨");
  }, [input]);

  const handleSelectedPlaybackStatusChange = useCallback((streamId: string, snapshot: RealtimePlayerSnapshot): void => {
    input.setAudioAnalysis((current) => nextAudioAnalysisState(current, streamId, snapshot, input.streams));
    input.setAudioActiveStreamId((currentStreamId) => nextAudioActiveStreamId(currentStreamId, streamId, snapshot));
  }, [input]);

  const toggleTalkbackTarget = useCallback((streamPath: string): void => {
    input.setTalkbackTargetStreamIds((current) => toggleStringSetItem(current, streamPath));
    input.setLayoutMessage("Talkback 대상 변경됨");
  }, [input]);

  const applyWidgetDialog = useCallback((): void => {
    input.setIsWidgetDialogOpen(false);
    input.setLayoutMessage("레이아웃 변경 적용됨");
  }, [input]);

  const cancelWidgetDialog = useCallback((): void => {
    input.setIsWidgetDialogOpen(false);
    input.setLayoutMessage("레이아웃 변경 취소됨");
  }, [input]);

  const cancelStreamConnection = useCallback((): void => {
    input.setEditingStreamId(null);
    input.setLayoutMessage("스트림 연결 변경 취소됨");
  }, [input]);

  const closeAssetDrawer = useCallback((): void => {
    input.setIsAssetDrawerOpen(false);
  }, [input]);

  return useMemo(() => ({
    applyWidgetDialog,
    cancelStreamConnection,
    cancelWidgetDialog,
    closeAssetDrawer,
    connectStreamAddress,
    connectStreamDevice,
    disconnectCurrentStreamSlot,
    handleSelectedPlaybackStatusChange,
    openStreamConnection,
    resetLayout,
    selectAssetTreeStream,
    selectMapStream,
    setWidgetVisible,
    toggleStreamAiMode,
    toggleTalkbackTarget,
    toggleWidgetPin,
  }), [applyWidgetDialog, cancelStreamConnection, cancelWidgetDialog, closeAssetDrawer, connectStreamAddress, connectStreamDevice, disconnectCurrentStreamSlot, handleSelectedPlaybackStatusChange, openStreamConnection, resetLayout, selectAssetTreeStream, selectMapStream, setWidgetVisible, toggleStreamAiMode, toggleTalkbackTarget, toggleWidgetPin]);
}

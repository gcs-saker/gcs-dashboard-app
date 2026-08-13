import { useCallback, useMemo } from "react";
import type { StreamDeviceOption } from "@dashboard/streamDevices";
import type { DashboardPageActionInput } from "./dashboardPageActionContracts";

type StreamActionInput = Pick<DashboardPageActionInput,
  | "connectStreamDeviceState" | "disconnectCurrentStreamSlotState" | "openStreamConnectionState"
  | "selectStreamState" | "setIsAssetDrawerOpen" | "setLayoutMessage" | "toggleStreamAiModeState"
>;

export function useDashboardStreamActions(input: StreamActionInput) {
  const {
    connectStreamDeviceState, disconnectCurrentStreamSlotState, openStreamConnectionState,
    selectStreamState, setIsAssetDrawerOpen, setLayoutMessage, toggleStreamAiModeState,
  } = input;
  const openStreamConnection = useCallback((streamId: string): void => {
    openStreamConnectionState(streamId);
    setLayoutMessage("스트림 슬롯 선택됨");
  }, [openStreamConnectionState, setLayoutMessage]);
  const selectMapStream = useCallback((streamId: string): void => {
    selectStreamState(streamId);
    setLayoutMessage("지도 핀 스트림 선택됨");
  }, [selectStreamState, setLayoutMessage]);
  const selectAssetTreeStream = useCallback((streamId: string): void => {
    selectStreamState(streamId);
    setIsAssetDrawerOpen(false);
    setLayoutMessage("자산트리 스트림 선택됨");
  }, [selectStreamState, setIsAssetDrawerOpen, setLayoutMessage]);
  const connectStreamDevice = useCallback((device: StreamDeviceOption): void => {
    connectStreamDeviceState(device);
    setLayoutMessage("스트림 연결됨");
  }, [connectStreamDeviceState, setLayoutMessage]);
  const disconnectCurrentStreamSlot = useCallback((): void => {
    disconnectCurrentStreamSlotState();
    setLayoutMessage("스트림 연결 해제됨");
  }, [disconnectCurrentStreamSlotState, setLayoutMessage]);
  const toggleStreamAiMode = useCallback((streamId: string): void => {
    toggleStreamAiModeState(streamId);
    setLayoutMessage("AI 모드 옵션 변경됨");
  }, [setLayoutMessage, toggleStreamAiModeState]);

  return useMemo(() => ({
    connectStreamDevice, disconnectCurrentStreamSlot, openStreamConnection,
    selectAssetTreeStream, selectMapStream, toggleStreamAiMode,
  }), [connectStreamDevice, disconnectCurrentStreamSlot, openStreamConnection, selectAssetTreeStream, selectMapStream, toggleStreamAiMode]);
}

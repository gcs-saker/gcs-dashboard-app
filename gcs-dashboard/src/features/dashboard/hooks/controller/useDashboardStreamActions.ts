import { useCallback, useMemo } from "react";
import type { StreamDeviceOption } from "@dashboard/assets/streamDevices";
import type { DashboardPageActionInput } from "@dashboard/hooks/controller/dashboardPageActionContracts";

type StreamActionInput = Pick<DashboardPageActionInput,
  | "connectStreamDeviceState" | "disconnectCurrentStreamSlotState" | "openStreamConnectionState"
  | "selectStreamState" | "setIsAssetDrawerOpen" | "toggleStreamAiModeState"
>;

export function useDashboardStreamActions(input: StreamActionInput) {
  const {
    connectStreamDeviceState, disconnectCurrentStreamSlotState, openStreamConnectionState,
    selectStreamState, setIsAssetDrawerOpen, toggleStreamAiModeState,
  } = input;
  const openStreamConnection = useCallback((streamId: string): void => {
    openStreamConnectionState(streamId);
  }, [openStreamConnectionState]);
  const selectMapStream = useCallback((streamId: string): void => {
    selectStreamState(streamId);
  }, [selectStreamState]);
  const selectAssetTreeStream = useCallback((streamId: string): void => {
    selectStreamState(streamId);
    setIsAssetDrawerOpen(false);
  }, [selectStreamState, setIsAssetDrawerOpen]);
  const connectStreamDevice = useCallback((device: StreamDeviceOption): void => {
    connectStreamDeviceState(device);
  }, [connectStreamDeviceState]);
  const disconnectCurrentStreamSlot = useCallback((): void => {
    disconnectCurrentStreamSlotState();
  }, [disconnectCurrentStreamSlotState]);
  const toggleStreamAiMode = useCallback((streamId: string): void => {
    toggleStreamAiModeState(streamId);
  }, [toggleStreamAiModeState]);

  return useMemo(() => ({
    connectStreamDevice, disconnectCurrentStreamSlot, openStreamConnection,
    selectAssetTreeStream, selectMapStream, toggleStreamAiMode,
  }), [connectStreamDevice, disconnectCurrentStreamSlot, openStreamConnection, selectAssetTreeStream, selectMapStream, toggleStreamAiMode]);
}

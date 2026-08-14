import type { Dispatch, SetStateAction } from "react";
import type { AudioAnalysisSnapshot } from "@dashboard/layout/dashboardPresentation";
import type { DashboardLayoutItem, DashboardWidgetId } from "@dashboard/layout/dashboardLayout";
import type { StreamDeviceOption } from "@dashboard/assets/streamDevices";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";

export interface DashboardPageActionInput {
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

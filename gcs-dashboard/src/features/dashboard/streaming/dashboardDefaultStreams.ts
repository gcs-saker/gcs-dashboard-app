import {
  DASHBOARD_STREAM_MODE,
  DASHBOARD_STREAM_STATUS,
} from "@/features/stateContracts";

import type { StreamSlot as DashboardStreamSlot } from "@streaming/layout/streamModel";

export const CCTV_EMPTY_STREAM_ID_PREFIX = "cctv-empty-";

export function createEmptyCctvStreamSlot(channelNumber: number): DashboardStreamSlot {
  const paddedChannelNumber = channelNumber.toString().padStart(2, "0");
  return emptyStreamSlot(
    `${CCTV_EMPTY_STREAM_ID_PREFIX}${channelNumber}`,
    `CCTV ${paddedChannelNumber}`,
    "클릭하여 채널 변경",
  );
}

export const DEFAULT_DASHBOARD_STREAMS: DashboardStreamSlot[] = Array.from(
  { length: 4 },
  (_, index) => emptyStreamSlot(`stream-slot-${index + 1}`, `스트리밍 ${index + 1}`, "스트림 미선택"),
);

function emptyStreamSlot(id: string, title: string, detail: string): DashboardStreamSlot {
  return {
    id,
    title,
    status: DASHBOARD_STREAM_STATUS.offline,
    mode: DASHBOARD_STREAM_MODE.eo,
    detail,
    connectedDeviceId: null,
    streamPath: null,
    geometry: null,
  };
}

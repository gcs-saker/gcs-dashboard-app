import {
  DASHBOARD_STREAM_MODE,
  DASHBOARD_STREAM_STATUS,
} from "@/features/stateContracts";

import type { DashboardStreamSlot } from "./streamTypes";

export const CCTV_EMPTY_STREAM_ID_PREFIX = "cctv-empty-";

export function createEmptyCctvStreamSlot(channelNumber: number): DashboardStreamSlot {
  const paddedChannelNumber = channelNumber.toString().padStart(2, "0");
  return {
    id: `${CCTV_EMPTY_STREAM_ID_PREFIX}${channelNumber}`,
    title: `CCTV ${paddedChannelNumber}`,
    status: DASHBOARD_STREAM_STATUS.offline,
    mode: DASHBOARD_STREAM_MODE.eo,
    detail: "클릭하여 채널 변경",
    connectedDeviceId: null,
    streamPath: null,
    geometry: null,
  };
}

export const DEFAULT_DASHBOARD_STREAMS: DashboardStreamSlot[] = [
  {
    id: "raw.sample.front",
    title: "스트리밍 1",
    status: DASHBOARD_STREAM_STATUS.offline,
    mode: DASHBOARD_STREAM_MODE.eo,
    detail: "스트림 대기",
    connectedDeviceId: null,
    streamPath: null,
    geometry: null,
  },
  {
    id: "raw.sample.thermal",
    title: "스트리밍 2",
    status: DASHBOARD_STREAM_STATUS.offline,
    mode: DASHBOARD_STREAM_MODE.ir,
    detail: "스트림 대기",
    connectedDeviceId: null,
    streamPath: null,
    geometry: null,
  },
  {
    id: "raw.sample.rear",
    title: "스트리밍 3",
    status: DASHBOARD_STREAM_STATUS.offline,
    mode: DASHBOARD_STREAM_MODE.ai,
    detail: "스트림 대기",
    connectedDeviceId: null,
    streamPath: null,
    geometry: null,
  },
  {
    id: "raw.local.webcam",
    title: "스트리밍 4",
    status: DASHBOARD_STREAM_STATUS.offline,
    mode: DASHBOARD_STREAM_MODE.map,
    detail: "스트림 대기",
    connectedDeviceId: null,
    streamPath: null,
    geometry: null,
  },
];

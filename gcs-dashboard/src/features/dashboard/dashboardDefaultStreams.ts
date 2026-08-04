import {
  DASHBOARD_GEOMETRY_SOURCE,
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
    status: DASHBOARD_STREAM_STATUS.online,
    mode: DASHBOARD_STREAM_MODE.eo,
    detail: "전방 EO / raw.sample.front",
    connectedDeviceId: "device-drn-01-front",
    streamPath: "raw.sample.front",
    geometry: {
      lat: 35.871435,
      lng: 128.601445,
      altitudeM: 120,
      headingDeg: 130,
      pitchDeg: -2.1,
      rollDeg: 1.3,
      yawDeg: 127,
      fovDeg: 72,
      source: DASHBOARD_GEOMETRY_SOURCE.mock,
    },
  },
  {
    id: "raw.sample.thermal",
    title: "스트리밍 2",
    status: DASHBOARD_STREAM_STATUS.fallback,
    mode: DASHBOARD_STREAM_MODE.ir,
    detail: "열화상 fallback / raw.sample.thermal",
    connectedDeviceId: "device-drn-02-thermal",
    streamPath: "raw.sample.thermal",
    geometry: {
      lat: 35.8781,
      lng: 128.5948,
      altitudeM: 96,
      headingDeg: 178,
      pitchDeg: -8,
      rollDeg: 0.5,
      yawDeg: 176,
      fovDeg: 58,
      source: DASHBOARD_GEOMETRY_SOURCE.mock,
    },
  },
  {
    id: "raw.sample.rear",
    title: "스트리밍 3",
    status: DASHBOARD_STREAM_STATUS.online,
    mode: DASHBOARD_STREAM_MODE.ai,
    detail: "AI 감지 overlay / raw.sample.rear",
    connectedDeviceId: "device-ugv-01-rear",
    streamPath: "raw.sample.rear",
    geometry: {
      lat: 35.8669,
      lng: 128.5931,
      altitudeM: 18,
      headingDeg: 84,
      pitchDeg: 0,
      rollDeg: 0,
      yawDeg: 84,
      fovDeg: 82,
      source: DASHBOARD_GEOMETRY_SOURCE.mock,
    },
  },
  {
    id: "raw.local.webcam",
    title: "스트리밍 4",
    status: DASHBOARD_STREAM_STATUS.offline,
    mode: DASHBOARD_STREAM_MODE.map,
    detail: "로컬 웹캠 대기 / raw.local.webcam",
    connectedDeviceId: "device-local-webcam",
    streamPath: "raw.local.webcam",
    geometry: {
      lat: 35.8724,
      lng: 128.6072,
      altitudeM: 12,
      headingDeg: 24,
      pitchDeg: 0,
      rollDeg: 0,
      yawDeg: 24,
      fovDeg: 64,
      source: DASHBOARD_GEOMETRY_SOURCE.mock,
    },
  },
];

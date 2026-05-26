import type { DashboardStreamMode, DashboardStreamSlot, DashboardStreamStatus } from "./streamTypes";

export interface StreamDeviceGeometry {
  lat: number;
  lng: number;
  altitudeM: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  yawDeg: number;
  fovDeg: number;
}

export interface StreamDeviceOption {
  id: string;
  name: string;
  streamPath: string;
  status: DashboardStreamStatus;
  mediaType: "eo" | "ir" | "ai" | "map";
  geometry: StreamDeviceGeometry;
}

export const MOCK_STREAM_DEVICES: StreamDeviceOption[] = [
  {
    id: "device-drn-01-front",
    name: "DRN-01 전방 EO",
    streamPath: "raw.sample.front",
    status: "online",
    mediaType: "eo",
    geometry: {
      lat: 37.123456,
      lng: 127.123456,
      altitudeM: 120,
      headingDeg: 130,
      pitchDeg: -2.1,
      rollDeg: 1.3,
      yawDeg: 127,
      fovDeg: 72,
    },
  },
  {
    id: "device-drn-02-thermal",
    name: "DRN-02 열화상",
    streamPath: "raw.sample.thermal",
    status: "fallback",
    mediaType: "ir",
    geometry: {
      lat: 37.1261,
      lng: 127.1204,
      altitudeM: 96,
      headingDeg: 178,
      pitchDeg: -8,
      rollDeg: 0.5,
      yawDeg: 176,
      fovDeg: 58,
    },
  },
  {
    id: "device-ugv-01-rear",
    name: "UGV-01 후방 AI",
    streamPath: "raw.sample.rear",
    status: "online",
    mediaType: "ai",
    geometry: {
      lat: 37.1204,
      lng: 127.1187,
      altitudeM: 18,
      headingDeg: 84,
      pitchDeg: 0,
      rollDeg: 0,
      yawDeg: 84,
      fovDeg: 82,
    },
  },
  {
    id: "device-local-webcam",
    name: "로컬 웹캠 테스트",
    streamPath: "raw.local.webcam",
    status: "offline",
    mediaType: "eo",
    geometry: {
      lat: 37.1242,
      lng: 127.1253,
      altitudeM: 12,
      headingDeg: 24,
      pitchDeg: 0,
      rollDeg: 0,
      yawDeg: 24,
      fovDeg: 64,
    },
  },
];

function modeForMediaType(mediaType: StreamDeviceOption["mediaType"]): DashboardStreamMode {
  switch (mediaType) {
    case "eo":
      return "EO";
    case "ir":
      return "IR";
    case "ai":
      return "AI";
    case "map":
      return "MAP";
  }
}

export function connectDeviceToStreamSlot(
  stream: DashboardStreamSlot,
  device: StreamDeviceOption,
): DashboardStreamSlot {
  return {
    ...stream,
    connectedDeviceId: device.id,
    detail: `${device.name} / ${device.streamPath}`,
    mode: modeForMediaType(device.mediaType),
    status: device.status,
    streamPath: device.streamPath,
    geometry: device.geometry,
  };
}

export function disconnectStreamSlot(stream: DashboardStreamSlot): DashboardStreamSlot {
  return {
    ...stream,
    connectedDeviceId: null,
    detail: "장비 미연결",
    status: "offline",
    streamPath: null,
    geometry: null,
  };
}

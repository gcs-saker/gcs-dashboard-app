import type { DashboardStreamMode, DashboardStreamSlot, DashboardStreamStatus } from "./streamTypes";
import { apiV1Url } from "../../config";
import { buildAuthHeaders } from "../auth/authApi";

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

export interface StreamRegistryResponse {
  streamId: string;
  path: string;
  status: "registered" | "online" | "offline" | "unknown";
  displayName?: string | null;
  prefix: string;
  assetId: string;
  sensorId: string;
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

export async function fetchStreamDeviceOptions(fetcher: typeof fetch = fetch): Promise<StreamDeviceOption[]> {
  const response = await fetcher(apiV1Url("/streams"), {
    headers: buildAuthHeaders({ Accept: "application/json" }),
  });
  if (!response.ok) {
    throw new Error(`stream registry request failed with ${response.status}`);
  }

  const registry = (await response.json()) as StreamRegistryResponse[];
  return registry.map(streamDeviceFromRegistryItem);
}

export function mergeStreamSlotsWithDevices(
  streams: DashboardStreamSlot[],
  devices: StreamDeviceOption[],
): DashboardStreamSlot[] {
  const devicesByStreamPath = new Map(devices.map((device) => [device.streamPath, device]));
  const nextStreams = streams.map((stream) => {
    if (!stream.streamPath) return stream;
    const device = devicesByStreamPath.get(stream.streamPath);
    if (!device) return { ...stream, status: "offline" as const };
    return {
      ...stream,
      connectedDeviceId: stream.connectedDeviceId ?? device.id,
      detail: `${device.name} / ${device.streamPath}`,
      mode: modeForMediaType(device.mediaType),
      status: device.status,
      geometry: stream.geometry ?? device.geometry,
    };
  });

  const knownStreamPaths = new Set(nextStreams.map((stream) => stream.streamPath).filter(Boolean));
  const discoveredStreams = devices
    .filter((device) => !knownStreamPaths.has(device.streamPath))
    .map((device, index): DashboardStreamSlot => ({
      id: device.streamPath,
      title: `스트리밍 ${nextStreams.length + index + 1}`,
      status: device.status,
      mode: modeForMediaType(device.mediaType),
      detail: `${device.name} / ${device.streamPath}`,
      connectedDeviceId: device.id,
      streamPath: device.streamPath,
      geometry: device.geometry,
    }));

  return [...nextStreams, ...discoveredStreams];
}

function streamDeviceFromRegistryItem(item: StreamRegistryResponse): StreamDeviceOption {
  const mediaType = item.sensorId.toLowerCase().includes("thermal") ? "ir" : "eo";
  return {
    id: `registry-${item.streamId}`,
    name: item.displayName ?? `${item.assetId} ${item.sensorId}`,
    streamPath: item.streamId,
    status: dashboardStatusFromRegistryStatus(item.status),
    mediaType,
    geometry: defaultGeometryForStream(item.streamId),
  };
}

function dashboardStatusFromRegistryStatus(status: StreamRegistryResponse["status"]): DashboardStreamStatus {
  switch (status) {
    case "online":
      return "online";
    case "offline":
      return "offline";
    case "registered":
    case "unknown":
      return "degraded";
  }
}

function defaultGeometryForStream(streamId: string): StreamDeviceGeometry {
  const knownDevice = MOCK_STREAM_DEVICES.find((device) => device.streamPath === streamId);
  if (knownDevice) return knownDevice.geometry;
  return {
    lat: 37.123456,
    lng: 127.123456,
    altitudeM: 0,
    headingDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    yawDeg: 0,
    fovDeg: 60,
  };
}

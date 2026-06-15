import type {
  DashboardGeometrySource,
  DashboardStreamGeometry,
  DashboardStreamMode,
  DashboardStreamSlot,
  DashboardStreamStatus,
} from "./streamTypes";
import { apiUrl, LOCAL_WEBCAM_STREAM_ID, streamApiV1Url } from "../../config";
import { DASHBOARD_API_ROUTES, STREAM_API_ROUTES } from "@/features/apiRoutes";
import { AuthApiError, authenticatedFetch } from "../auth/authApi";

export type StreamDeviceGeometry = DashboardStreamGeometry;

export interface StreamDeviceOption {
  id: string;
  name: string;
  streamPath: string;
  sourceUrl?: string | null;
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

export interface TelemetryReadResponse {
  uuid: string;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  epochTime: string;
}

export const MOCK_STREAM_DEVICES: StreamDeviceOption[] = [
  {
    id: "device-drn-01-front",
    name: "DRN-01 전방 EO",
    streamPath: "raw.sample.front",
    status: "online",
    mediaType: "eo",
    geometry: {
      lat: 35.871435,
      lng: 128.601445,
      altitudeM: 120,
      headingDeg: 130,
      pitchDeg: -2.1,
      rollDeg: 1.3,
      yawDeg: 127,
      fovDeg: 72,
      source: "mock",
    },
  },
  {
    id: "device-drn-02-thermal",
    name: "DRN-02 열화상",
    streamPath: "raw.sample.thermal",
    status: "fallback",
    mediaType: "ir",
    geometry: {
      lat: 35.8781,
      lng: 128.5948,
      altitudeM: 96,
      headingDeg: 178,
      pitchDeg: -8,
      rollDeg: 0.5,
      yawDeg: 176,
      fovDeg: 58,
      source: "mock",
    },
  },
  {
    id: "device-ugv-01-rear",
    name: "UGV-01 후방 AI",
    streamPath: "raw.sample.rear",
    status: "online",
    mediaType: "ai",
    geometry: {
      lat: 35.8669,
      lng: 128.5931,
      altitudeM: 18,
      headingDeg: 84,
      pitchDeg: 0,
      rollDeg: 0,
      yawDeg: 84,
      fovDeg: 82,
      source: "mock",
    },
  },
  {
    id: "device-local-webcam",
    name: "로컬 웹캠 테스트",
    streamPath: "raw.local.webcam",
    status: "offline",
    mediaType: "eo",
    geometry: {
      lat: 35.8724,
      lng: 128.6072,
      altitudeM: 12,
      headingDeg: 24,
      pitchDeg: 0,
      rollDeg: 0,
      yawDeg: 24,
      fovDeg: 64,
      source: "mock",
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
    sourceUrl: device.sourceUrl ?? null,
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
    sourceUrl: null,
    geometry: null,
  };
}

export function createManualStreamDeviceOption(
  address: string,
  displayName: string,
  fallbackTitle: string,
): StreamDeviceOption {
  const streamPath = normalizeStreamAddress(address);
  const normalizedDisplayName = displayName.trim() || fallbackTitle || streamPath;
  return {
    id: `manual-${streamPath}`,
    name: normalizedDisplayName,
    streamPath,
    sourceUrl: address.trim(),
    status: "online",
    mediaType: mediaTypeFromStreamPath(streamPath),
    geometry: defaultGeometryForStream(streamPath, "device"),
  };
}

export function normalizeStreamAddress(address: string): string {
  const trimmedAddress = address.trim();
  if (!trimmedAddress) {
    throw new Error("스트림 주소를 입력해야 합니다.");
  }

  const urlPath = streamPathFromUrl(trimmedAddress);
  const rawPath = urlPath ?? trimmedAddress;
  const withoutQuery = rawPath.split(/[?#]/)[0] ?? rawPath;
  const withoutEdgePrefix = withoutQuery
    .replace(/^\/+/, "")
    .replace(/^webrtc\//, "")
    .replace(/\/whip$/i, "")
    .replace(/\/whep$/i, "")
    .replace(/^hls\//, "")
    .replace(/\/index\.m3u8$/i, "");
  const normalized = withoutEdgePrefix.replace(/\//g, ".").replace(/\.+/g, ".").replace(/^\./, "").replace(/\.$/, "");
  if (!/^(raw|ai|archive)\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)?$/.test(normalized)) {
    throw new Error("스트림 주소는 raw/asset/sensor 또는 raw.asset.sensor 형식이어야 합니다.");
  }
  return normalized;
}

export async function fetchStreamDeviceOptions(fetcher: typeof fetch = fetch): Promise<StreamDeviceOption[]> {
  const [registry, telemetryByUuid] = await Promise.all([
    fetchStreamRegistry(fetcher),
    fetchTelemetryIndex(fetcher),
  ]);
  return registry.map((item) => streamDeviceFromRegistryItem(item, telemetryByUuid));
}

async function fetchStreamRegistry(fetcher: typeof fetch): Promise<StreamRegistryResponse[]> {
  const response = await authenticatedFetch(
      streamApiV1Url(STREAM_API_ROUTES.streams),
    {
      headers: { Accept: "application/json" },
    },
    fetcher,
  );
  if (response.status === 401) {
    throw new AuthApiError(response.status, "stream registry authentication required");
  }
  if (!response.ok) {
    throw new Error(`stream registry request failed with ${response.status}`);
  }

  return (await response.json()) as StreamRegistryResponse[];
}

export async function fetchTelemetryIndex(fetcher: typeof fetch = fetch): Promise<Map<string, TelemetryReadResponse>> {
  const response = await authenticatedFetch(
    apiUrl(DASHBOARD_API_ROUTES.telemetryAll),
    {
      headers: { Accept: "application/json" },
    },
    fetcher,
  );
  if (response.status === 401) {
    throw new AuthApiError(response.status, "telemetry authentication required");
  }
  if (!response.ok) {
    return new Map();
  }

  const telemetry = (await response.json()) as TelemetryReadResponse[];
  return new Map(telemetry.map((item) => [item.uuid, item]));
}

export function mergeStreamSlotsWithDevices(
  streams: DashboardStreamSlot[],
  devices: StreamDeviceOption[],
): DashboardStreamSlot[] {
  const devicesByStreamPath = new Map<string, StreamDeviceOption>();
  for (const device of devices) {
    if (!devicesByStreamPath.has(device.streamPath)) {
      devicesByStreamPath.set(device.streamPath, device);
    }
  }

  const seenStreamPaths = new Set<string>();
  const nextStreams = streams.flatMap((stream) => {
    if (stream.streamPath) {
      if (seenStreamPaths.has(stream.streamPath)) return [];
      seenStreamPaths.add(stream.streamPath);
    }

    if (!stream.streamPath) return stream;
    const device = devicesByStreamPath.get(stream.streamPath);
    if (!device) return { ...stream, status: "offline" as const };
    return {
      ...stream,
      connectedDeviceId: stream.connectedDeviceId ?? device.id,
      detail: `${device.name} / ${device.streamPath}`,
      mode: modeForMediaType(device.mediaType),
      status: device.status,
      sourceUrl: device.sourceUrl ?? stream.sourceUrl ?? null,
      geometry: shouldPreferDeviceGeometry(device.geometry) ? device.geometry : stream.geometry ?? device.geometry,
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
      sourceUrl: device.sourceUrl ?? null,
      geometry: device.geometry,
    }));

  return [...nextStreams, ...discoveredStreams];
}

export function preferredSelectedStreamId(
  currentStreamId: string,
  streams: DashboardStreamSlot[],
  devices: StreamDeviceOption[],
): string {
  if (devices.length === 0) return currentStreamId;

  const currentStream = streams.find((stream) => stream.id === currentStreamId);
  const currentDevice = devices.find((device) => device.streamPath === currentStream?.streamPath);
  if (currentDevice?.status === "online") return currentStreamId;

  const preferredDevice =
    devices.find((device) => device.streamPath === LOCAL_WEBCAM_STREAM_ID && device.status === "online") ??
    devices.find((device) => device.status === "online") ??
    devices.find((device) => device.streamPath === LOCAL_WEBCAM_STREAM_ID) ??
    devices[0];

  const matchingSlot = streams.find((stream) => stream.streamPath === preferredDevice.streamPath);
  return matchingSlot?.id ?? preferredDevice.streamPath;
}

function streamDeviceFromRegistryItem(
  item: StreamRegistryResponse,
  telemetryByUuid: Map<string, TelemetryReadResponse> = new Map(),
): StreamDeviceOption {
  const mediaType = item.sensorId.toLowerCase().includes("thermal") ? "ir" : "eo";
  const telemetry = telemetryByUuid.get(item.streamId) ?? telemetryByUuid.get(item.path);
  return {
    id: `registry-${item.streamId}`,
    name: item.displayName ?? `${item.assetId} ${item.sensorId}`,
    streamPath: item.streamId,
    status: dashboardStatusFromRegistryStatus(item.status),
    mediaType,
    geometry: telemetry ? geometryFromTelemetry(telemetry) : defaultGeometryForStream(item.streamId, "registry"),
  };
}

function shouldPreferDeviceGeometry(geometry: StreamDeviceGeometry): boolean {
  return geometry.source === "telemetry" || geometry.source === "device";
}

function geometryFromTelemetry(telemetry: TelemetryReadResponse): StreamDeviceGeometry {
  return {
    lat: telemetry.latitude,
    lng: telemetry.longitude,
    altitudeM: telemetry.altitude,
    headingDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    yawDeg: 0,
    fovDeg: 60,
    source: "telemetry",
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

function streamPathFromUrl(value: string): string | null {
  try {
    const parsed = new URL(value, typeof window === "undefined" ? "https://dashboard.local" : window.location.href);
    return parsed.pathname;
  } catch {
    return null;
  }
}

function mediaTypeFromStreamPath(streamPath: string): StreamDeviceOption["mediaType"] {
  const lowered = streamPath.toLowerCase();
  if (lowered.includes("thermal") || lowered.includes("ir")) return "ir";
  if (lowered.startsWith("ai.")) return "ai";
  return "eo";
}

function defaultGeometryForStream(streamId: string, source: DashboardGeometrySource = "mock"): StreamDeviceGeometry {
  const knownDevice = MOCK_STREAM_DEVICES.find((device) => device.streamPath === streamId);
  if (knownDevice) return { ...knownDevice.geometry, source };
  return {
    lat: 35.871435,
    lng: 128.601445,
    altitudeM: 0,
    headingDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    yawDeg: 0,
    fovDeg: 60,
    source,
  };
}

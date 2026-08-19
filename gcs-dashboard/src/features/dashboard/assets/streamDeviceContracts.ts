import type {
  DashboardStreamGeometry,
  DashboardStreamStatus,
} from "@dashboard/streaming/streamTypes";
import { isNullableString, isString, matchesPayloadSchema, type PayloadSchema } from "@/features/payloadValidation";

export type StreamDeviceGeometry = DashboardStreamGeometry;

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

export interface TelemetryReadResponse {
  uuid: string;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  epochTime: string;
  headingDeg?: number;
  batteryPercent?: number;
  rollDeg?: number;
  pitchDeg?: number;
  yawDeg?: number;
  gyroRadPerSec?: TelemetryVector3;
  accelMps2?: TelemetryVector3;
  linkQualityPercent?: number;
}

export interface TelemetryVector3 {
  x: number;
  y: number;
  z: number;
}

export interface TelemetryHistoryResponse {
  recordedAt: string;
  telemetry: TelemetryReadResponse;
}

const STREAM_REGISTRY_STATUSES = new Set<unknown>(["registered", "online", "offline", "unknown"]);
const STREAM_REGISTRY_SCHEMA: PayloadSchema = {
  streamId: isString,
  path: isString,
  status: isStreamRegistryStatus,
  displayName: (value) => value === undefined || isNullableString(value),
  prefix: isString,
  assetId: isString,
  sensorId: isString,
};

export function isStreamRegistryResponse(payload: unknown): payload is StreamRegistryResponse {
  return matchesPayloadSchema(payload, STREAM_REGISTRY_SCHEMA);
}

function isStreamRegistryStatus(value: unknown): value is StreamRegistryResponse["status"] {
  return STREAM_REGISTRY_STATUSES.has(value);
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

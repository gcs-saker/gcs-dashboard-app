import type {
  DashboardGeometrySource,
  DashboardStreamMode,
  DashboardStreamStatus,
} from "./streamTypes";
import {
  MOCK_STREAM_DEVICES,
  type StreamDeviceGeometry,
  type StreamDeviceOption,
  type StreamRegistryResponse,
  type TelemetryReadResponse,
} from "./streamDeviceContracts";

export function modeForMediaType(mediaType: StreamDeviceOption["mediaType"]): DashboardStreamMode {
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

export function streamDeviceFromRegistryItem(
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

export function shouldPreferDeviceGeometry(geometry: StreamDeviceGeometry): boolean {
  return geometry.source === "telemetry" || geometry.source === "device";
}

export function geometryFromTelemetry(telemetry: TelemetryReadResponse): StreamDeviceGeometry {
  return {
    lat: telemetry.latitude,
    lng: telemetry.longitude,
    altitudeM: telemetry.altitude,
    batteryPercent: telemetry.batteryPercent,
    headingDeg: telemetry.headingDeg ?? 0,
    pitchDeg: telemetry.pitchDeg ?? 0,
    rollDeg: telemetry.rollDeg ?? 0,
    yawDeg: telemetry.yawDeg ?? 0,
    fovDeg: 60,
    source: "telemetry",
  };
}

export function dashboardStatusFromRegistryStatus(status: StreamRegistryResponse["status"]): DashboardStreamStatus {
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

export function mediaTypeFromStreamPath(streamPath: string): StreamDeviceOption["mediaType"] {
  const lowered = streamPath.toLowerCase();
  if (lowered.includes("thermal") || lowered.includes("ir")) return "ir";
  if (lowered.startsWith("ai.")) return "ai";
  return "eo";
}

export function defaultGeometryForStream(
  streamId: string,
  source: DashboardGeometrySource = "mock",
): StreamDeviceGeometry {
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

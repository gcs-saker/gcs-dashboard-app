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
import { telemetryFreshnessFromObservedAt } from "./telemetryFreshness";

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
  const telemetry =
    telemetryByUuid.get(item.streamId) ??
    telemetryByUuid.get(item.path) ??
    telemetryByUuid.get(item.assetId);
  return {
    id: `registry-${item.streamId}`,
    name: safeRegistryDisplayName(item),
    streamPath: item.streamId,
    status: dashboardStatusFromRegistryStatus(item.status),
    mediaType,
    geometry: telemetry && hasTelemetryPosition(telemetry) ? geometryFromTelemetry(telemetry) : null,
  };
}

export function safeRegistryDisplayName(item: StreamRegistryResponse): string {
  const displayName = item.displayName?.trim();
  const containsInternalAddress = Boolean(displayName && (
    displayName.includes(item.streamId) ||
    displayName.includes(item.path) ||
    /readers|session/i.test(displayName)
  ));
  if (displayName && !containsInternalAddress) return displayName;
  return sensorLabel(item.sensorId);
}

function sensorLabel(sensorId: string): string {
  const normalized = sensorId.toLowerCase();
  if (normalized.includes("rear") || normalized.includes("back")) return "후면 카메라";
  if (normalized.includes("thermal") || normalized === "ir") return "열화상 카메라";
  if (normalized.includes("front") || normalized.includes("camera")) return "전면 카메라";
  return "송출 카메라";
}

export function shouldPreferDeviceGeometry(geometry: StreamDeviceGeometry | null): boolean {
  return geometry?.source === "telemetry" || geometry?.source === "device";
}

export function geometryFromTelemetry(telemetry: TelemetryReadResponse): StreamDeviceGeometry {
  return {
    lat: telemetry.latitude ?? 0,
    lng: telemetry.longitude ?? 0,
    altitudeM: telemetry.altitude ?? 0,
    batteryPercent: telemetry.batteryPercent,
    headingDeg: telemetry.headingDeg ?? 0,
    pitchDeg: telemetry.pitchDeg ?? 0,
    rollDeg: telemetry.rollDeg ?? 0,
    yawDeg: telemetry.yawDeg ?? 0,
    fovDeg: 60,
    observedAt: telemetry.observedAt ?? new Date().toISOString(),
    source: "telemetry",
    telemetryStatus: telemetryFreshnessFromObservedAt(telemetry.observedAt ?? new Date().toISOString()),
  };
}

export function dashboardStatusFromRegistryStatus(status: StreamRegistryResponse["status"]): DashboardStreamStatus {
  switch (status) {
    case "online":
      return "reconnecting";
    case "offline":
      return "offline";
    case "registered":
    case "unknown":
      return "degraded";
  }
}

function hasTelemetryPosition(telemetry: TelemetryReadResponse): boolean {
  return typeof telemetry.latitude === "number" && typeof telemetry.longitude === "number";
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
  if (knownDevice?.geometry) return { ...knownDevice.geometry, source };
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

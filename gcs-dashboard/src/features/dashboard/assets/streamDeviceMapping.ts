import type {
  DashboardStreamMode,
  DashboardStreamStatus,
} from "@dashboard/streaming/streamTypes";
import {
  type StreamDeviceGeometry,
  type StreamDeviceOption,
  type StreamRegistryResponse,
  type TelemetryReadResponse,
} from "@dashboard/assets/streamDeviceContracts";
import { isPublicStreamLabel } from "@streaming/presentation/streamPresentation";

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
    telemetryByUuid.get(item.assetId);
  return {
    id: `registry-${item.streamId}`,
    name: registryStreamDisplayName(item),
    streamPath: item.streamId,
    status: dashboardStatusFromRegistryStatus(item.status),
    mediaType,
    geometry: telemetry ? geometryFromTelemetry(telemetry) : null,
  };
}

function registryStreamDisplayName(item: StreamRegistryResponse): string {
  const provided = item.displayName?.trim();
  if (provided && isPublicStreamLabel(provided)) return provided;
  switch (item.sensorId.trim().toLowerCase()) {
    case "front": return "전방 카메라";
    case "rear": return "후방 카메라";
    case "thermal": return "열화상 카메라";
    default: return "연결된 스트림";
  }
}

export function shouldPreferDeviceGeometry(geometry: StreamDeviceGeometry | null): boolean {
  return geometry?.source === "telemetry" || geometry?.source === "device";
}

export function geometryFromTelemetry(telemetry: TelemetryReadResponse): StreamDeviceGeometry {
  return {
    lat: telemetry.latitude,
    lng: telemetry.longitude,
    altitudeM: telemetry.altitude,
    batteryPercent: telemetry.batteryPercent ?? undefined,
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
      return "offline";
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

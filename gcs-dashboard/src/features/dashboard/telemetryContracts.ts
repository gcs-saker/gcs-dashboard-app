import { DASHBOARD_API_ROUTES } from "@/features/apiRoutes";
import type { TelemetryHistoryResponse, TelemetryReadResponse } from "./streamDeviceContracts";

const TELEMETRY_HISTORY_MIN_LIMIT = 1;
const TELEMETRY_HISTORY_MAX_LIMIT = 500;

export function buildTelemetryHistoryPath(uuid: string, limit = 100): string {
  const boundedLimit = Math.max(TELEMETRY_HISTORY_MIN_LIMIT, Math.min(TELEMETRY_HISTORY_MAX_LIMIT, Math.round(limit)));
  return `${DASHBOARD_API_ROUTES.telemetryIngest}${encodeURIComponent(uuid)}${DASHBOARD_API_ROUTES.telemetryHistorySuffix}?limit=${boundedLimit}`;
}

export function isTelemetryHistoryResponse(payload: unknown): payload is TelemetryHistoryResponse {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<TelemetryHistoryResponse>;
  return typeof candidate.recordedAt === "string" && isTelemetryReadResponse(candidate.telemetry);
}

export function isTelemetryReadResponse(payload: unknown): payload is TelemetryReadResponse {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<TelemetryReadResponse>;
  return (
    typeof candidate.uuid === "string" &&
    typeof candidate.latitude === "number" &&
    typeof candidate.longitude === "number" &&
    typeof candidate.altitude === "number" &&
    typeof candidate.velocity === "number" &&
    typeof candidate.epochTime === "string" &&
    isOptionalNumber(candidate.headingDeg) &&
    isOptionalNumber(candidate.batteryPercent) &&
    isOptionalNumber(candidate.rollDeg) &&
    isOptionalNumber(candidate.pitchDeg) &&
    isOptionalNumber(candidate.yawDeg) &&
    isOptionalVector3(candidate.gyroRadPerSec) &&
    isOptionalVector3(candidate.accelMps2) &&
    isOptionalNumber(candidate.linkQualityPercent)
  );
}

function isOptionalNumber(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "number";
}

function isOptionalVector3(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (!value || typeof value !== "object") return false;
  const candidate = value as { x?: unknown; y?: unknown; z?: unknown };
  return (
    typeof candidate.x === "number" &&
    typeof candidate.y === "number" &&
    typeof candidate.z === "number"
  );
}

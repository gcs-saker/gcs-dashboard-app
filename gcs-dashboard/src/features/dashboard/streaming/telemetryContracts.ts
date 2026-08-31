import { DASHBOARD_API_ROUTES } from "@/features/apiRoutes";
import {
  isNumber,
  isOptionalNumber,
  isString,
  matchesPayloadSchema,
  type PayloadSchema,
} from "@/features/payloadValidation";
import type { TelemetryHistoryResponse, TelemetryReadResponse } from "@dashboard/assets/streamDeviceContracts";

const TELEMETRY_HISTORY_MIN_LIMIT = 1;
const TELEMETRY_HISTORY_MAX_LIMIT = 500;

const TELEMETRY_READ_SCHEMA: PayloadSchema = {
  uuid: isString,
  latitude: isNumber,
  longitude: isNumber,
  altitude: isNumber,
  velocity: isNumber,
  epochTime: isString,
  headingDeg: isOptionalNumber,
  batteryPercent: isOptionalNumber,
  rollDeg: isOptionalNumber,
  pitchDeg: isOptionalNumber,
  yawDeg: isOptionalNumber,
  gyroRadPerSec: isOptionalVector3,
  accelMps2: isOptionalVector3,
  linkQualityPercent: isOptionalNumber,
};

export function buildTelemetryHistoryPath(uuid: string, limit = 100): string {
  const boundedLimit = Math.max(TELEMETRY_HISTORY_MIN_LIMIT, Math.min(TELEMETRY_HISTORY_MAX_LIMIT, Math.round(limit)));
  return `${DASHBOARD_API_ROUTES.telemetryIngest}${encodeURIComponent(uuid)}${DASHBOARD_API_ROUTES.telemetryHistorySuffix}?limit=${boundedLimit}`;
}

export function isTelemetryHistoryResponse(payload: unknown): payload is TelemetryHistoryResponse {
  return matchesPayloadSchema(payload, { recordedAt: isString, telemetry: isTelemetryReadResponse });
}

export function isTelemetryReadResponse(payload: unknown): payload is TelemetryReadResponse {
  return matchesPayloadSchema(payload, TELEMETRY_READ_SCHEMA);
}

function isOptionalVector3(value: unknown): boolean {
  return value === undefined || matchesPayloadSchema(value, { x: isNumber, y: isNumber, z: isNumber });
}

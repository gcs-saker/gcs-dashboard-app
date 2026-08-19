import { apiUrl } from "@/config";
import { DASHBOARD_API_ROUTES } from "@/features/apiRoutes";
import { fetchValidatedJson } from "@features/apiClient";
import {
  isNullableString,
  isNumber,
  isString,
  matchesPayloadSchema,
  type PayloadSchema,
} from "@/features/payloadValidation";
import type { TimeSyncConfigInput, TimeSyncHealth, TimeSyncMode, TimeSyncStatus } from "@dashboard/operations/timeSync";

const TIME_SYNC_REQUEST_DESCRIPTION = "Time sync request";
const TIME_SYNC_RESPONSE_DESCRIPTION = "Time sync response";
const TIME_SYNC_MODES = new Set<unknown>(["public", "closed_network", "manual"]);
const TIME_SYNC_HEALTH = new Set<unknown>(["ok", "warn", "error"]);
const TIME_SYNC_STATUS_SCHEMA: PayloadSchema = {
  mode: isMode,
  sourceHost: isNullableString,
  sourcePort: isNumber,
  driftWarnMs: isNumber,
  updatedAt: isString,
  updatedBy: isString,
  serverTime: isString,
  monotonicMs: isNumber,
  timezone: isString,
  checkedAt: isString,
  health: isHealth,
  message: isString,
};

export async function fetchTimeSyncStatus(fetcher: typeof fetch = fetch): Promise<TimeSyncStatus> {
  return fetchTimeSyncJson(apiUrl(DASHBOARD_API_ROUTES.timeSyncStatus), fetcher);
}

export async function checkTimeSync(fetcher: typeof fetch = fetch): Promise<TimeSyncStatus> {
  return fetchTimeSyncJson(apiUrl(DASHBOARD_API_ROUTES.timeSyncCheck), fetcher, {
    method: "POST",
  });
}

export async function updateTimeSyncConfig(
  config: TimeSyncConfigInput,
  fetcher: typeof fetch = fetch,
): Promise<TimeSyncStatus> {
  return fetchTimeSyncJson(apiUrl(DASHBOARD_API_ROUTES.timeSyncConfig), fetcher, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: config.mode,
      sourceHost: config.mode === "manual" ? null : config.sourceHost.trim(),
      sourcePort: config.sourcePort,
      driftWarnMs: config.driftWarnMs,
    }),
  });
}

function fetchTimeSyncJson(
  url: string,
  fetcher: typeof fetch,
  init?: RequestInit,
): Promise<TimeSyncStatus> {
  return fetchValidatedJson({
    url,
    fetcher,
    init,
    isPayload: isTimeSyncStatus,
    requestDescription: TIME_SYNC_REQUEST_DESCRIPTION,
    invalidPayloadDescription: TIME_SYNC_RESPONSE_DESCRIPTION,
  });
}

function isTimeSyncStatus(payload: unknown): payload is TimeSyncStatus {
  return matchesPayloadSchema(payload, TIME_SYNC_STATUS_SCHEMA);
}

function isMode(value: unknown): value is TimeSyncMode {
  return TIME_SYNC_MODES.has(value);
}

function isHealth(value: unknown): value is TimeSyncHealth {
  return TIME_SYNC_HEALTH.has(value);
}

import { apiUrl } from "@/config";
import { DASHBOARD_API_ROUTES } from "@/features/apiRoutes";
import { fetchValidatedJson } from "@features/apiClient";
import type { TimeSyncConfigInput, TimeSyncHealth, TimeSyncMode, TimeSyncStatus } from "@dashboard/operations/timeSync";

const TIME_SYNC_REQUEST_DESCRIPTION = "Time sync request";
const TIME_SYNC_RESPONSE_DESCRIPTION = "Time sync response";

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
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<TimeSyncStatus>;
  return (
    isMode(candidate.mode) &&
    (typeof candidate.sourceHost === "string" || candidate.sourceHost === null) &&
    typeof candidate.sourcePort === "number" &&
    typeof candidate.driftWarnMs === "number" &&
    typeof candidate.updatedAt === "string" &&
    typeof candidate.updatedBy === "string" &&
    typeof candidate.serverTime === "string" &&
    typeof candidate.monotonicMs === "number" &&
    typeof candidate.timezone === "string" &&
    typeof candidate.checkedAt === "string" &&
    isHealth(candidate.health) &&
    typeof candidate.message === "string"
  );
}

function isMode(value: unknown): value is TimeSyncMode {
  return value === "public" || value === "closed_network" || value === "manual";
}

function isHealth(value: unknown): value is TimeSyncHealth {
  return value === "ok" || value === "warn" || value === "error";
}

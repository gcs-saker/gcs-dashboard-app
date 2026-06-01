import { apiUrl } from "../../config";
import { authenticatedFetch } from "../auth/authApi";
import type { TimeSyncConfigInput, TimeSyncHealth, TimeSyncMode, TimeSyncStatus } from "./timeSync";

export async function fetchTimeSyncStatus(fetcher: typeof fetch = fetch): Promise<TimeSyncStatus> {
  const response = await authenticatedFetch(apiUrl("/ops/time/status"), {
    headers: { Accept: "application/json" },
  }, fetcher);
  return parseTimeSyncResponse(response);
}

export async function checkTimeSync(fetcher: typeof fetch = fetch): Promise<TimeSyncStatus> {
  const response = await authenticatedFetch(apiUrl("/ops/time/check"), {
    method: "POST",
    headers: { Accept: "application/json" },
  }, fetcher);
  return parseTimeSyncResponse(response);
}

export async function updateTimeSyncConfig(
  config: TimeSyncConfigInput,
  fetcher: typeof fetch = fetch,
): Promise<TimeSyncStatus> {
  const response = await authenticatedFetch(apiUrl("/ops/time/config"), {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: config.mode,
      sourceHost: config.mode === "manual" ? null : config.sourceHost.trim(),
      sourcePort: config.sourcePort,
      driftWarnMs: config.driftWarnMs,
    }),
  }, fetcher);
  return parseTimeSyncResponse(response);
}

async function parseTimeSyncResponse(response: Response): Promise<TimeSyncStatus> {
  if (!response.ok) {
    throw new Error(`Time sync request failed with ${response.status}`);
  }
  const payload = await response.json();
  if (!isTimeSyncStatus(payload)) {
    throw new Error("Time sync response is invalid");
  }
  return payload;
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

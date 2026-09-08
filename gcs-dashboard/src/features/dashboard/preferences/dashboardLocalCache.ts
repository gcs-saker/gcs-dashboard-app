import { DASHBOARD_SERVER_HEALTH } from "@/features/stateContracts";
import { DEFAULT_SERVER_STATUS, type DashboardServerStatusSnapshot } from "@dashboard/operations/serverStatus";
import { RTT_HISTORY_LIMIT, type RttSample } from "@dashboard/operations/systemStatusRtt";
import {
  readIndexedDbRecords,
  writeIndexedDbRecords,
} from "@dashboard/preferences/indexedDbStore";

export const DASHBOARD_LOCAL_CACHE_DB_NAME = "gcs-saker-dashboard-local-cache";
export const DASHBOARD_LOCAL_CACHE_DB_VERSION = 1;
export const DASHBOARD_LOCAL_CACHE_STORE_NAME = "systemStatus";
export const DASHBOARD_SYSTEM_STATUS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const SYSTEM_STATUS_CACHE_KEYS = Object.freeze({
  latestSnapshot: "latestSnapshot",
  rttHistory: "rttHistory",
});

const SERVER_HEALTH_VALUES = new Set(Object.values(DASHBOARD_SERVER_HEALTH));
const DASHBOARD_LOCAL_CACHE_STORE_CONFIG = Object.freeze({
  dbName: DASHBOARD_LOCAL_CACHE_DB_NAME,
  storeName: DASHBOARD_LOCAL_CACHE_STORE_NAME,
  version: DASHBOARD_LOCAL_CACHE_DB_VERSION,
});

export interface SystemStatusLocalCache {
  readonly rttHistory: RttSample[];
  readonly status: DashboardServerStatusSnapshot;
}

export async function loadSystemStatusLocalCache(now = Date.now()): Promise<SystemStatusLocalCache> {
  const [statusRecord, rttRecord] = await readIndexedDbRecords(DASHBOARD_LOCAL_CACHE_STORE_CONFIG, [
    SYSTEM_STATUS_CACHE_KEYS.latestSnapshot,
    SYSTEM_STATUS_CACHE_KEYS.rttHistory,
  ]);

  return {
    rttHistory: normalizeRttHistory(rttRecord),
    status: normalizeCachedServerStatus(statusRecord, now),
  };
}

export async function saveSystemStatusLocalCache(
  status: DashboardServerStatusSnapshot,
  rttHistory: readonly RttSample[],
): Promise<void> {
  await writeIndexedDbRecords(DASHBOARD_LOCAL_CACHE_STORE_CONFIG, [
    [SYSTEM_STATUS_CACHE_KEYS.latestSnapshot, normalizeCachedServerStatus(status, status.checkedAt ?? Date.now())],
    [SYSTEM_STATUS_CACHE_KEYS.rttHistory, normalizeRttHistory(rttHistory)],
  ]);
}

export function emptySystemStatusLocalCache(): SystemStatusLocalCache {
  return {
    rttHistory: [],
    status: DEFAULT_SERVER_STATUS,
  };
}

export function normalizeCachedServerStatus(
  value: unknown,
  now = Date.now(),
): DashboardServerStatusSnapshot {
  if (!value || typeof value !== "object") return DEFAULT_SERVER_STATUS;
  const candidate = value as Partial<DashboardServerStatusSnapshot>;
  if (!isFreshTimestamp(candidate.checkedAt, now)) return DEFAULT_SERVER_STATUS;

  return {
    apiServer: healthOrDefault(candidate.apiServer),
    authServer: healthOrDefault(candidate.authServer),
    checkedAt: candidate.checkedAt,
    latencyMs: numberOrNull(candidate.latencyMs),
    readiness: healthOrDefault(candidate.readiness),
    signalingServer: healthOrDefault(candidate.signalingServer),
    streams: healthOrDefault(candidate.streams),
  };
}

export function normalizeRttHistory(value: unknown, limit = RTT_HISTORY_LIMIT): RttSample[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((sample): sample is Partial<RttSample> => Boolean(sample) && typeof sample === "object")
    .flatMap((sample) => {
      if (!isPositiveTimestamp(sample.checkedAt)) return [];
      return [{
        checkedAt: sample.checkedAt,
        latencyMs: numberOrNull(sample.latencyMs),
      }];
    })
    .slice(-limit);
}

function healthOrDefault(value: unknown) {
  return SERVER_HEALTH_VALUES.has(value as never)
    ? value as DashboardServerStatusSnapshot["apiServer"]
    : DASHBOARD_SERVER_HEALTH.degraded;
}

function isFreshTimestamp(value: unknown, now: number): value is number {
  return isPositiveTimestamp(value) && now - value <= DASHBOARD_SYSTEM_STATUS_CACHE_TTL_MS;
}

function isPositiveTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

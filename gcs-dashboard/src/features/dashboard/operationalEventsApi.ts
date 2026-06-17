import { apiUrl } from "../../config";
import { DASHBOARD_API_ROUTES } from "@/features/apiRoutes";
import { authenticatedFetch } from "../auth/authApi";
import type {
  OperationalEvent,
  OperationalEventFilters,
  OperationalEventMetrics,
  OperationalEventTimeBucket,
} from "./operationalEvents";

export async function fetchOperationalEvents(
  filters: OperationalEventFilters,
  fetcher: typeof fetch = fetch,
): Promise<OperationalEvent[]> {
  const response = await authenticatedFetch(buildOperationalEventsUrl(filters), {
    headers: { Accept: "application/json" },
  }, fetcher);

  if (!response.ok) {
    throw new Error(`Operational events request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload) || !payload.every(isOperationalEvent)) {
    throw new Error("Operational events response is invalid");
  }

  return payload;
}

export async function fetchOperationalEventMetrics(
  filters: OperationalEventFilters,
  fetcher: typeof fetch = fetch,
): Promise<OperationalEventMetrics> {
  const response = await authenticatedFetch(buildOperationalEventMetricsUrl(filters), {
    headers: { Accept: "application/json" },
  }, fetcher);

  if (!response.ok) {
    throw new Error(`Operational event metrics request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (!isOperationalEventMetrics(payload)) {
    throw new Error("Operational event metrics response is invalid");
  }

  return payload;
}

export async function fetchOperationalEventBuckets(
  filters: OperationalEventFilters,
  fetcher: typeof fetch = fetch,
): Promise<OperationalEventTimeBucket[]> {
  const response = await authenticatedFetch(buildOperationalEventBucketsUrl(filters), {
    headers: { Accept: "application/json" },
  }, fetcher);

  if (!response.ok) {
    throw new Error(`Operational event buckets request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload) || !payload.every(isOperationalEventTimeBucket)) {
    throw new Error("Operational event buckets response is invalid");
  }

  return payload;
}

export function buildOperationalEventsUrl(filters: OperationalEventFilters): string {
  return buildOperationalEventUrl(DASHBOARD_API_ROUTES.operationalEvents, filters);
}

export function buildOperationalEventMetricsUrl(filters: OperationalEventFilters): string {
  return buildOperationalEventUrl(DASHBOARD_API_ROUTES.operationalEventMetrics, filters);
}

export function buildOperationalEventBucketsUrl(filters: OperationalEventFilters): string {
  return buildOperationalEventUrl(DASHBOARD_API_ROUTES.operationalEventBuckets, filters);
}

function buildOperationalEventUrl(route: string, filters: OperationalEventFilters): string {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set("query", filters.query.trim());
  if (filters.severity !== "all") params.set("severity", filters.severity);
  if (filters.from) params.set("from", localDateTimeToInstant(filters.from));
  if (filters.to) params.set("to", localDateTimeToInstant(filters.to));
  const query = params.toString();
  return `${apiUrl(route)}${query ? `?${query}` : ""}`;
}

function localDateTimeToInstant(value: string): string {
  return new Date(value).toISOString();
}

function isOperationalEvent(payload: unknown): payload is OperationalEvent {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<OperationalEvent>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.occurredAt === "string" &&
    isSeverity(candidate.severity) &&
    isCategory(candidate.category) &&
    typeof candidate.source === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.connections === "number" &&
    typeof candidate.latencyMs === "number" &&
    typeof candidate.throughputMbps === "number"
  );
}

function isOperationalEventMetrics(payload: unknown): payload is OperationalEventMetrics {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<OperationalEventMetrics>;
  return (
    typeof candidate.totalEvents === "number" &&
    typeof candidate.totalConnections === "number" &&
    isNullableNumber(candidate.minLatencyMs) &&
    isNullableNumber(candidate.avgLatencyMs) &&
    isNullableNumber(candidate.maxLatencyMs) &&
    isNullableNumber(candidate.avgThroughputMbps) &&
    Array.isArray(candidate.severityCounts) &&
    candidate.severityCounts.every((item) =>
      item &&
      typeof item === "object" &&
      isSeverity((item as { severity?: unknown }).severity) &&
      typeof (item as { count?: unknown }).count === "number",
    )
  );
}

function isOperationalEventTimeBucket(payload: unknown): payload is OperationalEventTimeBucket {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<OperationalEventTimeBucket>;
  return (
    typeof candidate.bucketStart === "string" &&
    typeof candidate.eventCount === "number" &&
    typeof candidate.totalConnections === "number" &&
    isNullableNumber(candidate.avgLatencyMs) &&
    isNullableNumber(candidate.avgThroughputMbps)
  );
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === "number";
}

function isSeverity(value: unknown): value is OperationalEvent["severity"] {
  return value === "info" || value === "warn" || value === "error";
}

function isCategory(value: unknown): value is OperationalEvent["category"] {
  return value === "api" || value === "signaling" || value === "network" || value === "stream" || value === "security";
}

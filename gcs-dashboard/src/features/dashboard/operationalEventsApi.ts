import { apiUrl } from "../../config";
import { DASHBOARD_API_ROUTES } from "../apiRoutes";
import { authenticatedFetch } from "../auth/authApi";
import type { OperationalEvent, OperationalEventFilters } from "./operationalEvents";

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

export function buildOperationalEventsUrl(filters: OperationalEventFilters): string {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set("query", filters.query.trim());
  if (filters.severity !== "all") params.set("severity", filters.severity);
  if (filters.from) params.set("from", localDateTimeToInstant(filters.from));
  if (filters.to) params.set("to", localDateTimeToInstant(filters.to));
  const query = params.toString();
  return `${apiUrl(DASHBOARD_API_ROUTES.operationalEvents)}${query ? `?${query}` : ""}`;
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

function isSeverity(value: unknown): value is OperationalEvent["severity"] {
  return value === "info" || value === "warn" || value === "error";
}

function isCategory(value: unknown): value is OperationalEvent["category"] {
  return value === "api" || value === "signaling" || value === "network" || value === "stream" || value === "security";
}

import { apiUrl } from "@/config";
import { DASHBOARD_API_ROUTES } from "@/features/apiRoutes";
import type { OperationalEventFilters } from "@dashboard/operations/operationalEvents";

export const DEFAULT_OPERATIONAL_EVENT_PAGE_LIMIT = 10;

export function buildOperationalEventsUrl(filters: OperationalEventFilters): string {
  return buildOperationalEventUrl(DASHBOARD_API_ROUTES.operationalEvents, filters);
}

export function buildOperationalEventPageUrl(
  filters: OperationalEventFilters,
  limit = DEFAULT_OPERATIONAL_EVENT_PAGE_LIMIT,
): string {
  return buildOperationalEventUrl(DASHBOARD_API_ROUTES.operationalEventsPage, filters, limit);
}

export function buildOperationalEventStreamUrl(
  filters: OperationalEventFilters,
  after?: { id: string; occurredAt: string } | null,
): string {
  const url = new URL(buildOperationalEventUrl(DASHBOARD_API_ROUTES.operationalEventsStream, filters), "http://local");
  if (after) {
    url.searchParams.set("afterOccurredAt", after.occurredAt);
    url.searchParams.set("afterId", after.id);
  }
  return `${url.pathname}${url.search}`;
}

export function buildOperationalEventMetricsUrl(filters: OperationalEventFilters): string {
  return buildOperationalEventUrl(DASHBOARD_API_ROUTES.operationalEventMetrics, filters);
}

export function buildOperationalEventBucketsUrl(filters: OperationalEventFilters): string {
  return buildOperationalEventUrl(DASHBOARD_API_ROUTES.operationalEventBuckets, filters);
}

function buildOperationalEventUrl(route: string, filters: OperationalEventFilters, limit?: number): string {
  const params = new URLSearchParams();
  const query = filters.query.trim();
  if (query) params.set("query", query);
  if (filters.severity !== "all") params.set("severity", filters.severity);
  if (filters.from) params.set("from", localDateTimeToInstant(filters.from));
  if (filters.to) params.set("to", localDateTimeToInstant(filters.to));
  if (limit !== undefined) params.set("limit", String(limit));

  const encoded = params.toString();
  return `${apiUrl(route)}${encoded ? `?${encoded}` : ""}`;
}

function localDateTimeToInstant(value: string): string {
  return new Date(value).toISOString();
}

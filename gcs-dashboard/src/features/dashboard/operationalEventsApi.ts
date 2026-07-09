import { fetchValidatedJson, type PayloadGuard } from "@features/apiClient";
import type {
  OperationalEvent,
  OperationalEventFilters,
  OperationalEventMetrics,
  OperationalEventPage,
  OperationalEventTimeBucket,
} from "./operationalEvents";
import {
  isOperationalEvent,
  isOperationalEventMetrics,
  isOperationalEventPage,
  isOperationalEventTimeBucket,
} from "./operationalEventGuards";
import {
  buildOperationalEventBucketsUrl,
  buildOperationalEventMetricsUrl,
  buildOperationalEventPageUrl,
  buildOperationalEventsUrl,
  buildOperationalEventStreamUrl,
  DEFAULT_OPERATIONAL_EVENT_PAGE_LIMIT,
} from "./operationalEventRoutes";
export {
  consumeOperationalEventStream,
  OperationalEventStreamError,
  parseOperationalEventSseBuffer,
  type OperationalEventStreamHandlers,
} from "./operationalEventStreamApi";

export {
  buildOperationalEventBucketsUrl,
  buildOperationalEventMetricsUrl,
  buildOperationalEventPageUrl,
  buildOperationalEventsUrl,
  buildOperationalEventStreamUrl,
};

export async function fetchOperationalEvents(
  filters: OperationalEventFilters,
  fetcher: typeof fetch = fetch,
): Promise<OperationalEvent[]> {
  return fetchOperationalEventJson(
    buildOperationalEventsUrl(filters),
    fetcher,
    isOperationalEventList,
    "Operational events request",
    "Operational events response",
  );
}

export async function fetchOperationalEventPage(
  filters: OperationalEventFilters,
  fetcher: typeof fetch = fetch,
  limit = DEFAULT_OPERATIONAL_EVENT_PAGE_LIMIT,
): Promise<OperationalEventPage> {
  return fetchOperationalEventJson(
    buildOperationalEventPageUrl(filters, limit),
    fetcher,
    isOperationalEventPage,
    "Operational event page request",
    "Operational event page response",
  );
}

export async function fetchOperationalEventMetrics(
  filters: OperationalEventFilters,
  fetcher: typeof fetch = fetch,
): Promise<OperationalEventMetrics> {
  return fetchOperationalEventJson(
    buildOperationalEventMetricsUrl(filters),
    fetcher,
    isOperationalEventMetrics,
    "Operational event metrics request",
    "Operational event metrics response",
  );
}

export async function fetchOperationalEventBuckets(
  filters: OperationalEventFilters,
  fetcher: typeof fetch = fetch,
): Promise<OperationalEventTimeBucket[]> {
  return fetchOperationalEventJson(
    buildOperationalEventBucketsUrl(filters),
    fetcher,
    isOperationalEventBucketList,
    "Operational event buckets request",
    "Operational event buckets response",
  );
}

function fetchOperationalEventJson<T>(
  url: string,
  fetcher: typeof fetch,
  isPayload: PayloadGuard<T>,
  requestDescription: string,
  invalidPayloadDescription: string,
): Promise<T> {
  return fetchValidatedJson({
    url,
    fetcher,
    isPayload,
    requestDescription,
    invalidPayloadDescription,
  });
}

function isOperationalEventList(payload: unknown): payload is OperationalEvent[] {
  return Array.isArray(payload) && payload.every(isOperationalEvent);
}

function isOperationalEventBucketList(payload: unknown): payload is OperationalEventTimeBucket[] {
  return Array.isArray(payload) && payload.every(isOperationalEventTimeBucket);
}

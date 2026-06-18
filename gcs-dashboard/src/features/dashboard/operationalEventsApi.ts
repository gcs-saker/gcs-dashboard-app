import { apiUrl } from "../../config";
import { DASHBOARD_API_ROUTES } from "@/features/apiRoutes";
import { authenticatedFetch } from "../auth/authApi";
import type {
  OperationalEvent,
  OperationalEventFilters,
  OperationalEventMetrics,
  OperationalEventPage,
  OperationalEventTimeBucket,
} from "./operationalEvents";

const DEFAULT_OPERATIONAL_EVENT_PAGE_LIMIT = 50;
const OPERATIONAL_EVENT_STREAM_EVENT = "operational-event";
const OPERATIONAL_EVENT_STREAM_HEARTBEAT = "heartbeat";
const SSE_FIELD_EVENT = "event:";
const SSE_FIELD_DATA = "data:";

export interface OperationalEventStreamHandlers {
  onEvent: (event: OperationalEvent) => void;
  onHeartbeat?: (checkedAt: string | null) => void;
}

interface OperationalEventStreamOptions {
  fetcher?: typeof fetch;
  signal?: AbortSignal;
}

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

export async function fetchOperationalEventPage(
  filters: OperationalEventFilters,
  fetcher: typeof fetch = fetch,
  limit = DEFAULT_OPERATIONAL_EVENT_PAGE_LIMIT,
): Promise<OperationalEventPage> {
  const response = await authenticatedFetch(buildOperationalEventPageUrl(filters, limit), {
    headers: { Accept: "application/json" },
  }, fetcher);

  if (!response.ok) {
    throw new Error(`Operational event page request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (!isOperationalEventPage(payload)) {
    throw new Error("Operational event page response is invalid");
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

export async function consumeOperationalEventStream(
  filters: OperationalEventFilters,
  handlers: OperationalEventStreamHandlers,
  options: OperationalEventStreamOptions = {},
): Promise<void> {
  const fetcher = options.fetcher ?? fetch;
  const response = await authenticatedFetch(buildOperationalEventStreamUrl(filters), {
    headers: { Accept: "text/event-stream" },
    signal: options.signal,
  }, fetcher);

  if (!response.ok) {
    throw new Error(`Operational event stream request failed with ${response.status}`);
  }
  if (!response.body) {
    throw new Error("Operational event stream response body is unavailable");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const parsed = parseOperationalEventSseBuffer(buffer);
    buffer = parsed.remaining;
    parsed.messages.forEach((message) => handleOperationalEventStreamMessage(message, handlers));
    if (done) break;
  }

  const flushed = parseOperationalEventSseBuffer(`${buffer}\n\n`);
  flushed.messages.forEach((message) => handleOperationalEventStreamMessage(message, handlers));
}

export function buildOperationalEventsUrl(filters: OperationalEventFilters): string {
  return buildOperationalEventUrl(DASHBOARD_API_ROUTES.operationalEvents, filters);
}

export function buildOperationalEventPageUrl(filters: OperationalEventFilters, limit = DEFAULT_OPERATIONAL_EVENT_PAGE_LIMIT): string {
  return buildOperationalEventUrl(DASHBOARD_API_ROUTES.operationalEventsPage, filters, limit);
}

export function buildOperationalEventStreamUrl(filters: OperationalEventFilters): string {
  return buildOperationalEventUrl(DASHBOARD_API_ROUTES.operationalEventsStream, filters);
}

export function buildOperationalEventMetricsUrl(filters: OperationalEventFilters): string {
  return buildOperationalEventUrl(DASHBOARD_API_ROUTES.operationalEventMetrics, filters);
}

export function buildOperationalEventBucketsUrl(filters: OperationalEventFilters): string {
  return buildOperationalEventUrl(DASHBOARD_API_ROUTES.operationalEventBuckets, filters);
}

function buildOperationalEventUrl(route: string, filters: OperationalEventFilters, limit?: number): string {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set("query", filters.query.trim());
  if (filters.severity !== "all") params.set("severity", filters.severity);
  if (filters.from) params.set("from", localDateTimeToInstant(filters.from));
  if (filters.to) params.set("to", localDateTimeToInstant(filters.to));
  if (limit !== undefined) params.set("limit", String(limit));
  const query = params.toString();
  return `${apiUrl(route)}${query ? `?${query}` : ""}`;
}

interface SseMessage {
  event: string;
  data: string;
}

export function parseOperationalEventSseBuffer(buffer: string): { messages: SseMessage[]; remaining: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const remaining = blocks.pop() ?? "";
  const messages = blocks
    .map(parseSseBlock)
    .filter((message): message is SseMessage => message !== null);
  return { messages, remaining };
}

function parseSseBlock(block: string): SseMessage | null {
  let event = "";
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(SSE_FIELD_EVENT)) {
      event = line.slice(SSE_FIELD_EVENT.length).trim();
    }
    if (line.startsWith(SSE_FIELD_DATA)) {
      dataLines.push(line.slice(SSE_FIELD_DATA.length).trimStart());
    }
  }
  if (!event || dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

function handleOperationalEventStreamMessage(
  message: SseMessage,
  handlers: OperationalEventStreamHandlers,
): void {
  if (message.event === OPERATIONAL_EVENT_STREAM_EVENT) {
    const payload = JSON.parse(message.data) as unknown;
    if (!isOperationalEvent(payload)) {
      throw new Error("Operational event stream payload is invalid");
    }
    handlers.onEvent(payload);
    return;
  }
  if (message.event === OPERATIONAL_EVENT_STREAM_HEARTBEAT) {
    const payload = JSON.parse(message.data) as { checkedAt?: unknown };
    handlers.onHeartbeat?.(typeof payload.checkedAt === "string" ? payload.checkedAt : null);
  }
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
    isNullableString(candidate.eventType) &&
    isNullableString(candidate.sourceService) &&
    typeof candidate.source === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.connections === "number" &&
    typeof candidate.latencyMs === "number" &&
    typeof candidate.throughputMbps === "number" &&
    isNullableString(candidate.streamId) &&
    isNullableString(candidate.connectionId) &&
    isNullableString(candidate.icePath) &&
    isNullableString(candidate.relayFallbackReason)
  );
}

function isOperationalEventPage(payload: unknown): payload is OperationalEventPage {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<OperationalEventPage>;
  return (
    Array.isArray(candidate.events) &&
    candidate.events.every(isOperationalEvent) &&
    (candidate.nextCursor === null || typeof candidate.nextCursor === "string")
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
    ) &&
    Array.isArray(candidate.icePathCounts) &&
    candidate.icePathCounts.every(isOperationalEventIcePathCount) &&
    Array.isArray(candidate.streamSessions) &&
    candidate.streamSessions.every(isOperationalStreamSessionMetric)
  );
}

function isOperationalEventIcePathCount(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as { icePath?: unknown; count?: unknown };
  return typeof candidate.icePath === "string" && typeof candidate.count === "number";
}

function isOperationalStreamSessionMetric(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as {
    streamId?: unknown;
    connectionId?: unknown;
    lastOccurredAt?: unknown;
    eventCount?: unknown;
    averageLatencyMs?: unknown;
    averageThroughputMbps?: unknown;
    icePath?: unknown;
    relayFallbackReason?: unknown;
  };
  return (
    typeof candidate.streamId === "string" &&
    isNullableString(candidate.connectionId) &&
    typeof candidate.lastOccurredAt === "string" &&
    typeof candidate.eventCount === "number" &&
    isNullableNumber(candidate.averageLatencyMs) &&
    isNullableNumber(candidate.averageThroughputMbps) &&
    isNullableString(candidate.icePath) &&
    isNullableString(candidate.relayFallbackReason)
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

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isSeverity(value: unknown): value is OperationalEvent["severity"] {
  return value === "info" || value === "warn" || value === "error";
}

function isCategory(value: unknown): value is OperationalEvent["category"] {
  return value === "api" || value === "signaling" || value === "network" || value === "stream" || value === "security";
}

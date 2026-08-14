import type {
  OperationalEvent,
  OperationalEventMetrics,
  OperationalEventPage,
  OperationalEventTimeBucket,
} from "@dashboard/operations/operationalEvents";

export function isOperationalEvent(payload: unknown): payload is OperationalEvent {
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

export function isOperationalEventPage(payload: unknown): payload is OperationalEventPage {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<OperationalEventPage>;
  return (
    Array.isArray(candidate.events) &&
    candidate.events.every(isOperationalEvent) &&
    (candidate.nextCursor === null || typeof candidate.nextCursor === "string")
  );
}

export function isOperationalEventMetrics(payload: unknown): payload is OperationalEventMetrics {
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

export function isOperationalEventTimeBucket(payload: unknown): payload is OperationalEventTimeBucket {
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

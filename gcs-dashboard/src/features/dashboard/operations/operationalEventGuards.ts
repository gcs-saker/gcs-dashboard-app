import {
  isArrayOf,
  isNullableNumber,
  isNullableString,
  isNumber,
  isString,
  matchesPayloadSchema,
  type PayloadSchema,
} from "@/features/payloadValidation";
import type {
  OperationalEvent,
  OperationalEventMetrics,
  OperationalEventPage,
  OperationalEventTimeBucket,
} from "@dashboard/operations/operationalEvents";

const SEVERITIES = new Set<unknown>(["info", "warn", "error"]);
const CATEGORIES = new Set<unknown>(["api", "signaling", "network", "stream", "security"]);

const OPERATIONAL_EVENT_SCHEMA: PayloadSchema = {
  id: isString,
  occurredAt: isString,
  severity: isSeverity,
  category: isCategory,
  eventType: isNullableString,
  sourceService: isNullableString,
  source: isString,
  message: isString,
  connections: isNumber,
  latencyMs: isNumber,
  throughputMbps: isNumber,
  streamId: isNullableString,
  connectionId: isNullableString,
  icePath: isNullableString,
  relayFallbackReason: isNullableString,
};

const STREAM_SESSION_SCHEMA: PayloadSchema = {
  streamId: isString,
  connectionId: isNullableString,
  lastOccurredAt: isString,
  eventCount: isNumber,
  averageLatencyMs: isNullableNumber,
  averageThroughputMbps: isNullableNumber,
  icePath: isNullableString,
  relayFallbackReason: isNullableString,
};

export function isOperationalEvent(payload: unknown): payload is OperationalEvent {
  return matchesPayloadSchema(payload, OPERATIONAL_EVENT_SCHEMA);
}

export function isOperationalEventPage(payload: unknown): payload is OperationalEventPage {
  return matchesPayloadSchema(payload, {
    events: isArrayOf(isOperationalEvent),
    nextCursor: isNullableString,
  });
}

export function isOperationalEventMetrics(payload: unknown): payload is OperationalEventMetrics {
  return matchesPayloadSchema(payload, {
    totalEvents: isNumber,
    totalConnections: isNumber,
    minLatencyMs: isNullableNumber,
    avgLatencyMs: isNullableNumber,
    maxLatencyMs: isNullableNumber,
    avgThroughputMbps: isNullableNumber,
    severityCounts: isArrayOf(isOperationalSeverityCount),
    icePathCounts: isArrayOf(isOperationalEventIcePathCount),
    streamSessions: isArrayOf(isOperationalStreamSessionMetric),
  });
}

export function isOperationalEventTimeBucket(payload: unknown): payload is OperationalEventTimeBucket {
  return matchesPayloadSchema(payload, {
    bucketStart: isString,
    eventCount: isNumber,
    totalConnections: isNumber,
    avgLatencyMs: isNullableNumber,
    avgThroughputMbps: isNullableNumber,
  });
}

function isOperationalSeverityCount(payload: unknown): payload is { severity: OperationalEvent["severity"]; count: number } {
  return matchesPayloadSchema(payload, { severity: isSeverity, count: isNumber });
}

function isOperationalEventIcePathCount(payload: unknown): payload is { icePath: string; count: number } {
  return matchesPayloadSchema(payload, { icePath: isString, count: isNumber });
}

function isOperationalStreamSessionMetric(
  payload: unknown,
): payload is OperationalEventMetrics["streamSessions"][number] {
  return matchesPayloadSchema(payload, STREAM_SESSION_SCHEMA);
}

function isSeverity(value: unknown): value is OperationalEvent["severity"] {
  return SEVERITIES.has(value);
}

function isCategory(value: unknown): value is OperationalEvent["category"] {
  return CATEGORIES.has(value);
}

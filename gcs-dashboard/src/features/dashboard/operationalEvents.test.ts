import { describe, expect, test } from "vitest";
import {
  filterOperationalEvents,
  summarizeOperationalEventMetrics,
  summarizeOperationalEvents,
  type OperationalEvent,
} from "./operationalEvents";

const BASE_EVENT: OperationalEvent = {
  category: "network",
  connectionId: "conn-001",
  connections: 2,
  eventType: "ice.selected",
  icePath: "srflx",
  id: "evt-001",
  latencyMs: 40,
  message: "STUN direct path selected",
  occurredAt: "2026-06-29T00:00:00Z",
  relayFallbackReason: null,
  severity: "info",
  source: "Signaling 서버",
  sourceService: "media-control",
  streamId: "raw.mobile.front",
  throughputMbps: 12,
};

function event(overrides: Partial<OperationalEvent>): OperationalEvent {
  return { ...BASE_EVENT, ...overrides };
}

describe("operationalEvents", () => {
  test("filters events by query, severity, and time range", () => {
    const events = [
      BASE_EVENT,
      event({
        id: "evt-002",
        message: "TURN relay fallback",
        occurredAt: "2026-06-29T00:10:00Z",
        severity: "warn",
      }),
      event({
        id: "evt-003",
        message: "Auth token rejected",
        occurredAt: "2026-06-29T00:30:00Z",
        severity: "error",
      }),
    ];

    expect(filterOperationalEvents(events, {
      from: "2026-06-29T00:05:00Z",
      query: "relay",
      severity: "warn",
      to: "2026-06-29T00:20:00Z",
    }).map((item) => item.id)).toEqual(["evt-002"]);
  });

  test("summarizes local operational events without server aggregates", () => {
    expect(summarizeOperationalEvents([
      BASE_EVENT,
      event({ connections: 3, latencyMs: 80, severity: "warn", throughputMbps: 18 }),
      event({ connections: 1, latencyMs: 60, severity: "error", throughputMbps: 9 }),
    ])).toEqual({
      avgLatencyMs: 60,
      connections: 6,
      errors: 1,
      peakThroughputMbps: 18,
      warnings: 1,
    });
  });

  test("summarizes server-side metrics using severity counts", () => {
    expect(summarizeOperationalEventMetrics({
      avgLatencyMs: 51.4,
      avgThroughputMbps: 17.5,
      icePathCounts: [],
      maxLatencyMs: 90,
      minLatencyMs: 20,
      severityCounts: [
        { count: 3, severity: "warn" },
        { count: 1, severity: "error" },
      ],
      streamSessions: [],
      totalConnections: 20,
      totalEvents: 4,
    })).toEqual({
      avgLatencyMs: 51,
      connections: 20,
      errors: 1,
      peakThroughputMbps: 17.5,
      warnings: 3,
    });
  });
});

import { describe, expect, it } from "vitest";

import { buildEventLogViewModel } from "@dashboard/operations/eventLogViewModel";
import type { OperationalEvent, OperationalEventMetrics } from "@dashboard/operations/operationalEvents";

const baseEvent: OperationalEvent = {
  category: "network",
  connectionId: "conn-001",
  connections: 3,
  eventType: "ice.relay_fallback",
  icePath: "relay",
  id: "evt-001",
  latencyMs: 150,
  message: "TURN relay fallback",
  occurredAt: "2026-06-01T00:00:00Z",
  relayFallbackReason: "host candidate failed",
  severity: "warn",
  source: "TURN",
  sourceService: "turn",
  streamId: "raw.local.webcam",
  throughputMbps: 24,
};

const apiEvent: OperationalEvent = {
  ...baseEvent,
  category: "api",
  id: "evt-002",
  icePath: "host",
  message: "API ready",
  severity: "info",
  source: "API",
};

const metrics: OperationalEventMetrics = {
  avgLatencyMs: 75,
  avgThroughputMbps: 12.5,
  icePathCounts: [
    { icePath: "relay", count: 2 },
    { icePath: "host", count: 5 },
    { icePath: "srflx", count: 7 },
  ],
  maxLatencyMs: 150,
  minLatencyMs: 30,
  severityCounts: [
    { severity: "info", count: 8 },
    { severity: "warn", count: 2 },
    { severity: "error", count: 1 },
  ],
  streamSessions: [{
    averageLatencyMs: 75,
    averageThroughputMbps: 12.5,
    connectionId: "conn-001",
    eventCount: 3,
    icePath: "relay",
    lastOccurredAt: "2026-06-01T00:00:00Z",
    relayFallbackReason: null,
    streamId: "raw.local.webcam",
  }],
  totalConnections: 21,
  totalEvents: 11,
};

describe("eventLogViewModel", () => {
  it("uses server metrics only when client-only facets are not active", () => {
    const model = buildEventLogViewModel({
      rawEvents: [baseEvent, apiEvent],
      filters: { query: "", severity: "all", from: "", to: "" },
      categoryFilter: "all",
      sourceFilter: "all",
      selectedEventId: "evt-002",
      metrics,
    });

    expect(model.canUseServerMetrics).toBe(true);
    expect(model.summary.connections).toBe(21);
    expect(model.throughputLabel).toBe("Avg Throughput");
    expect(model.relayCount).toBe(2);
    expect(model.directCandidateCount).toBe(12);
    expect(model.selectedEvent?.id).toBe("evt-002");
  });

  it("falls back to visible events when category or source facets are active", () => {
    const model = buildEventLogViewModel({
      rawEvents: [baseEvent, apiEvent],
      filters: { query: "relay", severity: "warn", from: "", to: "" },
      categoryFilter: "network",
      sourceFilter: "TURN",
      selectedEventId: null,
      metrics,
    });

    expect(model.canUseServerMetrics).toBe(false);
    expect(model.events).toEqual([baseEvent]);
    expect(model.summary.connections).toBe(3);
    expect(model.activeFilterText).toContain("Network");
    expect(model.currentIncidents).toEqual([baseEvent]);
  });
});

import { describe, expect, test, vi } from "vitest";
import {
  buildOperationalEventBucketsUrl,
  buildOperationalEventMetricsUrl,
  buildOperationalEventsUrl,
  fetchOperationalEventBuckets,
  fetchOperationalEventMetrics,
  fetchOperationalEvents,
} from "./operationalEventsApi";
import type { OperationalEventFilters } from "./operationalEvents";

describe("operationalEventsApi", () => {
  test("builds server-side filtering query parameters", () => {
    const filters: OperationalEventFilters = {
      query: " ice ",
      severity: "warn",
      from: "2026-06-01T09:00",
      to: "",
    };

    expect(buildOperationalEventsUrl(filters)).toContain("/api/ops/events?query=ice&severity=warn&from=");
    expect(buildOperationalEventMetricsUrl(filters)).toContain("/api/ops/events/metrics?query=ice&severity=warn&from=");
    expect(buildOperationalEventBucketsUrl(filters)).toContain("/api/ops/events/buckets?query=ice&severity=warn&from=");
  });

  test("fetches and validates operational event payloads", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse([
        {
          id: "evt-001",
          occurredAt: "2026-06-01T00:00:00Z",
          severity: "info",
          category: "api",
          source: "API 서버",
          message: "헬스체크 정상",
          connections: 1,
          latencyMs: 42,
          throughputMbps: 10,
        },
      ]),
    );

    const events = await fetchOperationalEvents({ query: "", severity: "all", from: "", to: "" }, fetcher);

    expect(events).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith("/api/ops/events", expect.objectContaining({ credentials: "include" }));
  });

  test("rejects malformed operational event payloads before rendering", async () => {
    const fetcher = vi.fn(async () => jsonResponse([{ id: "bad" }]));

    await expect(
      fetchOperationalEvents({ query: "", severity: "all", from: "", to: "" }, fetcher),
    ).rejects.toThrow("Operational events response is invalid");
  });

  test("fetches and validates aggregate operational event metrics", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        totalEvents: 2,
        totalConnections: 10,
        minLatencyMs: 40,
        avgLatencyMs: 60,
        maxLatencyMs: 80,
        avgThroughputMbps: 15,
        severityCounts: [
          { severity: "info", count: 1 },
          { severity: "warn", count: 1 },
        ],
      }),
    );

    const metrics = await fetchOperationalEventMetrics({ query: "", severity: "all", from: "", to: "" }, fetcher);

    expect(metrics.avgLatencyMs).toBe(60);
    expect(fetcher).toHaveBeenCalledWith("/api/ops/events/metrics", expect.objectContaining({ credentials: "include" }));
  });

  test("rejects malformed operational event metrics before graph rendering", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ totalEvents: 1, severityCounts: [{ severity: "debug", count: 1 }] }));

    await expect(
      fetchOperationalEventMetrics({ query: "", severity: "all", from: "", to: "" }, fetcher),
    ).rejects.toThrow("Operational event metrics response is invalid");
  });

  test("fetches and validates operational event time buckets", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse([
        {
          bucketStart: "2026-06-01T00:00:00Z",
          eventCount: 2,
          totalConnections: 10,
          avgLatencyMs: 60,
          avgThroughputMbps: 15,
        },
      ]),
    );

    const buckets = await fetchOperationalEventBuckets({ query: "", severity: "all", from: "", to: "" }, fetcher);

    expect(buckets).toHaveLength(1);
    expect(buckets[0].avgLatencyMs).toBe(60);
    expect(fetcher).toHaveBeenCalledWith("/api/ops/events/buckets", expect.objectContaining({ credentials: "include" }));
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

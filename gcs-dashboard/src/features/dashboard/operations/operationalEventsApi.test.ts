import { describe, expect, test, vi } from "vitest";
import {
  buildOperationalEventBucketsUrl,
  buildOperationalEventPageUrl,
  buildOperationalEventStreamUrl,
  buildOperationalEventMetricsUrl,
  buildOperationalEventsUrl,
  consumeOperationalEventStream,
  fetchOperationalEventBuckets,
  fetchOperationalEventPage,
  fetchOperationalEventMetrics,
  fetchOperationalEvents,
  OperationalEventStreamError,
  parseOperationalEventSseBuffer,
} from "@dashboard/operations/operationalEventsApi";
import { ApiHttpError } from "@features/apiClient";
import type { OperationalEventFilters } from "@dashboard/operations/operationalEvents";

describe("operationalEventsApi", () => {
  test("builds server-side filtering query parameters", () => {
    const filters: OperationalEventFilters = {
      query: " ice ",
      severity: "warn",
      from: "2026-06-01T09:00",
      to: "",
    };

    expect(buildOperationalEventsUrl(filters)).toContain("/api/ops/events?query=ice&severity=warn&from=");
    expect(buildOperationalEventPageUrl(filters, 25)).toContain("/api/ops/events/page?query=ice&severity=warn&from=");
    expect(buildOperationalEventStreamUrl(filters)).toContain("/api/ops/events/stream?query=ice&severity=warn&from=");
    expect(buildOperationalEventPageUrl(filters, 25)).toContain("limit=25");
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
          eventType: "health.ok",
          sourceService: "auth-policy",
          source: "API 서버",
          message: "헬스체크 정상",
          connections: 1,
          latencyMs: 42,
          throughputMbps: 10,
          streamId: null,
          connectionId: null,
          icePath: null,
          relayFallbackReason: null,
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

  test("fetches and validates keyset operational event page payloads", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        events: [
          {
            id: "evt-001",
            occurredAt: "2026-06-01T00:00:00Z",
            severity: "warn",
            category: "network",
            eventType: "ice.relay_fallback",
            sourceService: "turn",
            source: "TURN 릴레이",
            message: "직접 ICE 후보 실패",
            connections: 7,
            latencyMs: 80,
            throughputMbps: 20,
            streamId: "raw/local/webcam",
            connectionId: "conn-whep-001",
            icePath: "relay",
            relayFallbackReason: "srflx candidate failed",
          },
        ],
        nextCursor: "cursor-001",
      }),
    );

    const page = await fetchOperationalEventPage({ query: "", severity: "all", from: "", to: "" }, fetcher, 25);

    expect(page.events).toHaveLength(1);
    expect(page.nextCursor).toBe("cursor-001");
    expect(fetcher).toHaveBeenCalledWith("/api/ops/events/page?limit=25", expect.objectContaining({ credentials: "include" }));
  });

  test("rejects malformed operational event page payloads before rendering", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ events: [{ id: "bad" }], nextCursor: 42 }));

    await expect(
      fetchOperationalEventPage({ query: "", severity: "all", from: "", to: "" }, fetcher),
    ).rejects.toThrow("Operational event page response is invalid");
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
        icePathCounts: [
          { icePath: "relay", count: 1 },
        ],
        streamSessions: [
          {
            streamId: "raw/local/webcam",
            connectionId: "conn-whep-001",
            lastOccurredAt: "2026-06-01T00:00:00Z",
            eventCount: 2,
            averageLatencyMs: 60,
            averageThroughputMbps: 15,
            icePath: "relay",
            relayFallbackReason: "srflx candidate failed",
          },
        ],
      }),
    );

    const metrics = await fetchOperationalEventMetrics({ query: "", severity: "all", from: "", to: "" }, fetcher);

    expect(metrics.avgLatencyMs).toBe(60);
    expect(metrics.icePathCounts).toEqual([{ icePath: "relay", count: 1 }]);
    expect(metrics.streamSessions[0].streamId).toBe("raw/local/webcam");
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

  test("parses operational event SSE messages split across chunks", () => {
    const first = parseOperationalEventSseBuffer("event: operational-event\ndata: {\"id\":\"evt-");
    const second = parseOperationalEventSseBuffer(`${first.remaining}001"}\n\n`);

    expect(first.messages).toEqual([]);
    expect(second.messages).toEqual([{ event: "operational-event", data: "{\"id\":\"evt-001\"}" }]);
  });

  test("consumes operational event stream with authenticated fetch", async () => {
    const event = {
      id: "evt-stream-001",
      occurredAt: "2026-06-01T00:00:00Z",
      severity: "info",
      category: "stream",
      eventType: "stream.online",
      sourceService: "media-control",
      source: "스트림 Registry",
      message: "신규 스트림 감지",
      connections: 2,
      latencyMs: 30,
      throughputMbps: 12,
      streamId: "raw/local/webcam",
      connectionId: "conn-001",
      icePath: "srflx",
      relayFallbackReason: null,
    };
    const fetcher = vi.fn(async () =>
      streamResponse([
        `event: operational-event\ndata: ${JSON.stringify(event)}\n\n`,
        "event: heartbeat\ndata: {\"checkedAt\":\"2026-06-01T00:00:01Z\"}\n\n",
      ]),
    );
    const onEvent = vi.fn();
    const onHeartbeat = vi.fn();

    await consumeOperationalEventStream(
      { query: "", severity: "all", from: "", to: "" },
      { onEvent, onHeartbeat },
      { fetcher },
    );

    expect(fetcher).toHaveBeenCalledWith("/api/ops/events/stream", expect.objectContaining({ credentials: "include" }));
    expect(onEvent).toHaveBeenCalledWith(event);
    expect(onHeartbeat).toHaveBeenCalledWith("2026-06-01T00:00:01Z");
  });

  test("rejects malformed stream events before merging into dashboard state", async () => {
    const fetcher = vi.fn(async () => streamResponse(["event: operational-event\ndata: {\"id\":\"bad\"}\n\n"]));

    await expect(
      consumeOperationalEventStream({ query: "", severity: "all", from: "", to: "" }, { onEvent: vi.fn() }, { fetcher }),
    ).rejects.toThrow("Operational event stream payload is invalid");
  });

  test("exposes event stream HTTP failures as API HTTP errors", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ detail: "down" }, 503));

    await expect(
      consumeOperationalEventStream({ query: "", severity: "all", from: "", to: "" }, { onEvent: vi.fn() }, { fetcher }),
    ).rejects.toBeInstanceOf(ApiHttpError);
  });

  test("exposes missing stream body as an event stream error", async () => {
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, body: null }) as Response);

    await expect(
      consumeOperationalEventStream({ query: "", severity: "all", from: "", to: "" }, { onEvent: vi.fn() }, { fetcher }),
    ).rejects.toBeInstanceOf(OperationalEventStreamError);
  });

  test("rejects invalid stream JSON with a stream specific error", async () => {
    const fetcher = vi.fn(async () => streamResponse(["event: operational-event\ndata: not-json\n\n"]));

    await expect(
      consumeOperationalEventStream({ query: "", severity: "all", from: "", to: "" }, { onEvent: vi.fn() }, { fetcher }),
    ).rejects.toThrow("Operational event stream payload JSON is invalid");
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    body: new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }),
  } as Response;
}

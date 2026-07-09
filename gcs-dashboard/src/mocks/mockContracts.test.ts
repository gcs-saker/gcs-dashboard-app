import { describe, expect, test } from "vitest";
import { isStreamRegistryResponse } from "@dashboard/streamDeviceContracts";
import { isTelemetryReadResponse } from "@dashboard/telemetryContracts";
import {
  MOCK_OPERATIONAL_BUCKETS,
  MOCK_OPERATIONAL_EVENTS,
  MOCK_OPERATIONAL_METRICS,
  MOCK_MAP_CONFIG,
  MOCK_STREAM_REGISTRY,
  MOCK_TELEMETRY,
} from "./fixtures";
import { urlPattern } from "./handlerUtils";

describe("mock API contracts", () => {
  test("keeps stream and telemetry fixtures compatible with dashboard DTO guards", () => {
    expect(MOCK_STREAM_REGISTRY.every(isStreamRegistryResponse)).toBe(true);
    expect(MOCK_TELEMETRY.every(isTelemetryReadResponse)).toBe(true);
  });

  test("keeps operational fixtures aligned with event and graph expectations", () => {
    expect(MOCK_OPERATIONAL_EVENTS.every((event) => event.id && event.occurredAt && event.message)).toBe(true);
    expect(MOCK_OPERATIONAL_METRICS.totalEvents).toBe(MOCK_OPERATIONAL_EVENTS.length);
    expect(MOCK_OPERATIONAL_BUCKETS.reduce((sum, bucket) => sum + bucket.eventCount, 0)).toBe(MOCK_OPERATIONAL_EVENTS.length);
  });

  test("keeps map fixture explicit for closed-network preview fallback", () => {
    expect(MOCK_MAP_CONFIG.provider).toBe("esri-satellite");
    expect(MOCK_MAP_CONFIG.styleUrl).toContain("{z}/{y}/{x}");
    expect(MOCK_MAP_CONFIG.requiresApiKey).toBe(false);
  });

  test("matches parameterized MSW URL patterns with query strings", () => {
    expect(urlPattern("/media-control/api/v1/streams/:streamId/playback").test("/media-control/api/v1/streams/raw.sample.front/playback?x=1")).toBe(true);
    expect(urlPattern("/api/telemetry/:uuid/history").test("/api/telemetry/raw.sample.front/history?limit=25")).toBe(true);
  });
});

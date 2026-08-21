import { describe, expect, test } from "vitest";

import { DEFAULT_DASHBOARD_STREAMS } from "@dashboard/streaming/dashboardDefaultStreams";

describe("production dashboard defaults", () => {
  test("starts with empty opaque slots instead of sample routes or telemetry", () => {
    expect(DEFAULT_DASHBOARD_STREAMS).toHaveLength(4);
    expect(DEFAULT_DASHBOARD_STREAMS.every((stream) => stream.streamPath === null)).toBe(true);
    expect(DEFAULT_DASHBOARD_STREAMS.every((stream) => stream.geometry === null)).toBe(true);
    expect(DEFAULT_DASHBOARD_STREAMS.every((stream) => stream.connectedDeviceId === null)).toBe(true);
    expect(JSON.stringify(DEFAULT_DASHBOARD_STREAMS)).not.toMatch(/raw\.|sample|webcam/i);
  });
});

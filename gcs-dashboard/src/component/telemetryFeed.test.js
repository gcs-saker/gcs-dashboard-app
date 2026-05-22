import { describe, expect, test, vi } from "vitest";

import { fetchTelemetryNodes } from "./telemetryFeed";

function jsonResponse(payload, ok = true) {
  return {
    ok,
    headers: { get: () => "application/json" },
    json: vi.fn().mockResolvedValue(payload),
  };
}

describe("fetchTelemetryNodes", () => {
  test("returns telemetry array and sends bearer token when available", async () => {
    const payload = [{ uuid: "raw.sample.front", latitude: 35.1, longitude: 128.1 }];
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(payload));

    await expect(fetchTelemetryNodes({ token: "test-token", fetcher })).resolves.toEqual(payload);
    expect(fetcher).toHaveBeenCalledWith("/api/telemetry/all", {
      headers: { Authorization: "Bearer test-token" },
    });
  });

  test("returns an empty list for non-json dev server fallback responses", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "text/html" },
      json: vi.fn(),
    });

    await expect(fetchTelemetryNodes({ fetcher })).resolves.toEqual([]);
  });

  test("returns an empty list for non-array api payloads", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ detail: "Not authenticated" }));

    await expect(fetchTelemetryNodes({ fetcher })).resolves.toEqual([]);
  });

  test("returns an empty list when the telemetry request is unreachable", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(fetchTelemetryNodes({ fetcher })).resolves.toEqual([]);
  });
});

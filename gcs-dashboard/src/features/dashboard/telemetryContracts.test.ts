import { describe, expect, it } from "vitest";

import {
  buildTelemetryHistoryPath,
  isTelemetryHistoryResponse,
  isTelemetryReadResponse,
} from "./telemetryContracts";

describe("telemetryContracts", () => {
  it("bounds telemetry history limit and encodes uuid", () => {
    expect(buildTelemetryHistoryPath("raw/local/webcam", 999)).toBe(
      "/telemetry/raw%2Flocal%2Fwebcam/history?limit=500",
    );
    expect(buildTelemetryHistoryPath("raw.local.webcam", 0)).toBe(
      "/telemetry/raw.local.webcam/history?limit=1",
    );
  });

  it("validates telemetry DTO shape before UI usage", () => {
    const telemetry = {
      uuid: "raw.local.webcam",
      latitude: 35.8714,
      longitude: 128.6014,
      altitude: 120,
      velocity: 8.5,
      epochTime: "00:10:23",
    };

    expect(isTelemetryReadResponse(telemetry)).toBe(true);
    expect(isTelemetryHistoryResponse({ recordedAt: "2026-06-01T00:00:00Z", telemetry })).toBe(true);
    expect(isTelemetryHistoryResponse({ recordedAt: "2026-06-01T00:00:00Z", telemetry: { uuid: "bad" } })).toBe(false);
  });
});

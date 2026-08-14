import { describe, expect, it } from "vitest";

import {
  buildTelemetryHistoryPath,
  isTelemetryHistoryResponse,
  isTelemetryReadResponse,
} from "@dashboard/streaming/telemetryContracts";

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
      headingDeg: 130,
      batteryPercent: 78,
      rollDeg: 1.3,
      pitchDeg: -2.1,
      yawDeg: 127,
      gyroRadPerSec: { x: 0.01, y: -0.02, z: 0.03 },
      accelMps2: { x: 0.1, y: 0.2, z: 9.81 },
      linkQualityPercent: 92.5,
    };

    expect(isTelemetryReadResponse(telemetry)).toBe(true);
    expect(isTelemetryHistoryResponse({ recordedAt: "2026-06-01T00:00:00Z", telemetry })).toBe(true);
    expect(isTelemetryHistoryResponse({ recordedAt: "2026-06-01T00:00:00Z", telemetry: { uuid: "bad" } })).toBe(false);
    expect(isTelemetryReadResponse({ ...telemetry, gyroRadPerSec: { x: 1, y: 2 } })).toBe(false);
  });
});

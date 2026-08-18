import { describe, expect, test } from "vitest";
import { telemetryFreshnessForStream, telemetryFreshnessFromObservedAt } from "./telemetryFreshness";

describe("telemetry freshness", () => {
  test("distinguishes missing, fresh, and stale selected-stream telemetry", () => {
    expect(telemetryFreshnessForStream({ geometry: null, status: "online" })).toBe("unavailable");
    expect(telemetryFreshnessForStream({
      geometry: {
        altitudeM: 0,
        fovDeg: 60,
        headingDeg: 0,
        lat: 35.8,
        lng: 128.6,
        pitchDeg: 0,
        rollDeg: 0,
        source: "telemetry",
        telemetryStatus: "fresh",
        yawDeg: 0,
      },
      status: "online",
    })).toBe("fresh");
    expect(telemetryFreshnessForStream({
      geometry: {
        altitudeM: 0,
        fovDeg: 60,
        headingDeg: 0,
        lat: 35.8,
        lng: 128.6,
        pitchDeg: 0,
        rollDeg: 0,
        source: "telemetry",
        telemetryStatus: "fresh",
        yawDeg: 0,
      },
      status: "offline",
    })).toBe("stale");
  });

  test("uses a fifteen-second freshness window", () => {
    const now = Date.parse("2026-08-18T06:00:15.000Z");
    expect(telemetryFreshnessFromObservedAt("2026-08-18T06:00:01.000Z", now)).toBe("fresh");
    expect(telemetryFreshnessFromObservedAt("2026-08-18T05:59:59.000Z", now)).toBe("stale");
  });
});

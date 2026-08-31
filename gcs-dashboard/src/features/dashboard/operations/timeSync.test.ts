import { describe, expect, test } from "vitest";
import { calculateBrowserOffsetMs, timeSyncHealthLabel, timeSyncModeLabel, type TimeSyncStatus } from "@dashboard/operations/timeSync";

const status: TimeSyncStatus = {
  mode: "public",
  sourceHost: "pool.ntp.org",
  sourcePort: 123,
  driftWarnMs: 1000,
  updatedAt: "1970-01-01T00:00:00Z",
  updatedBy: "system",
  serverTime: "2026-06-01T00:00:00Z",
  monotonicMs: 42000,
  timezone: "UTC",
  checkedAt: "2026-06-01T00:00:00Z",
  health: "ok",
  message: "ok",
};

describe("timeSync", () => {
  test("calculates browser offset from server time", () => {
    expect(calculateBrowserOffsetMs(status, Date.parse("2026-06-01T00:00:01Z"))).toBe(1000);
  });

  test("returns Korean labels for mode and health", () => {
    expect(timeSyncModeLabel("closed_network")).toBe("폐쇄망");
    expect(timeSyncHealthLabel("warn")).toBe("주의");
  });
});

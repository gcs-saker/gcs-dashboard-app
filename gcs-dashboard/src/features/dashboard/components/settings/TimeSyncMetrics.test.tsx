import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { TimeSyncStatus } from "@dashboard/operations/timeSync";
import { formatClockOffset, TimeSyncMetrics } from "./TimeSyncMetrics";

const status: TimeSyncStatus = {
  mode: "public", sourceHost: "pool.ntp.org", sourcePort: 123, driftWarnMs: 1000,
  updatedAt: "2026-08-31T00:00:00Z", updatedBy: "admin", serverTime: "2026-08-31T00:00:00Z",
  monotonicMs: 277079454, timezone: "UTC", checkedAt: "2026-08-31T00:00:01Z", health: "ok", message: "ok",
  clockStatus: "warning", clockDriftMs: -2285, timeSource: "ntp-unauthenticated:pool.ntp.org:123",
  clockMeasuredAt: "2026-08-31T00:00:01Z",
};

describe("TimeSyncMetrics", () => {
  test("explains clock direction and omits the internal monotonic clock", () => {
    render(<TimeSyncMetrics browserOffsetMs={-6043} status={status} />);

    expect(screen.getByText("-2,285 ms")).toBeInTheDocument();
    expect(screen.getByText("주의 · 허용 1,000 ms")).toBeInTheDocument();
    expect(screen.queryByText(/277079454/)).not.toBeInTheDocument();
    expect(screen.getByText("동기화 소스")).toBeInTheDocument();
  });

  test("formats ahead and near-equal offsets", () => {
    expect(formatClockOffset(2200)).toBe("브라우저 2.2초 빠름");
    expect(formatClockOffset(120)).toBe("거의 일치");
  });
});

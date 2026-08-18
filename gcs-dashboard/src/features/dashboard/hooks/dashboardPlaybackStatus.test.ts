import { describe, expect, test } from "vitest";
import type { RealtimePlayerSnapshot } from "@streaming/types";
import { dashboardStatusFromPlaybackSnapshot } from "./useDashboardPageActions";

function snapshot(overrides: Partial<RealtimePlayerSnapshot>): RealtimePlayerSnapshot {
  return {
    mode: "loading",
    streamStatus: "unknown",
    errorMessage: null,
    ...overrides,
  };
}

describe("dashboard playback status", () => {
  test("only confirms online after a WebRTC first frame", () => {
    expect(dashboardStatusFromPlaybackSnapshot(snapshot({ mode: "webrtc", streamStatus: "online" }))).toBe("reconnecting");
    expect(dashboardStatusFromPlaybackSnapshot(snapshot({
      mode: "webrtc",
      streamStatus: "online",
      webrtcFirstFrameLatencyMs: 420,
    }))).toBe("online");
  });

  test("maps terminal and fallback playback modes", () => {
    expect(dashboardStatusFromPlaybackSnapshot(snapshot({ mode: "error" }))).toBe("error");
    expect(dashboardStatusFromPlaybackSnapshot(snapshot({ mode: "offline", streamStatus: "offline" }))).toBe("offline");
    expect(dashboardStatusFromPlaybackSnapshot(snapshot({ mode: "hls", streamStatus: "online" }))).toBe("fallback");
  });
});

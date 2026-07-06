import { describe, expect, it } from "vitest";
import {
  DASHBOARD_STREAM_MODE,
  DASHBOARD_STREAM_STATUS,
} from "@/features/stateContracts";
import {
  buildDashboardPageViewModel,
  nextAudioActiveStreamId,
  toggleStringSetItem,
} from "./dashboardPageViewModel";
import { createDefaultDashboardUserPreferences } from "./userPreferences";
import type { DashboardStreamSlot } from "./streamTypes";
import type { RealtimePlayerSnapshot } from "@streaming/types";

const selectedStream: DashboardStreamSlot = {
  detail: "front",
  geometry: {
    altitudeM: 120,
    fovDeg: 72,
    headingDeg: 7,
    lat: 35.871435,
    lng: 128.601445,
    pitchDeg: 0,
    rollDeg: 0,
    source: "telemetry",
    yawDeg: 7,
  },
  id: "raw.mobile.front",
  mode: DASHBOARD_STREAM_MODE.eo,
  status: DASHBOARD_STREAM_STATUS.online,
  streamPath: "raw.mobile.front",
  title: "Mobile Front",
};

const playbackSnapshot: RealtimePlayerSnapshot = {
  audioJitterMs: 10,
  audioLevel: 0.3,
  audioPacketsLost: 0,
  errorMessage: null,
  hasAudioTrack: true,
  iceRoundTripTimeMs: 32,
  iceTransportProtocol: "udp",
  isAudioActive: true,
  localCandidateType: "srflx",
  mode: "webrtc",
  remoteCandidateType: "host",
  streamStatus: "online",
  webrtcFirstFrameLatencyMs: 120,
  webrtcWhepResponseMs: 24,
};

describe("dashboardPageViewModel", () => {
  it("builds page-level derived state outside the React component", () => {
    const preferences = { ...createDefaultDashboardUserPreferences(), cctvLayoutMode: "3x3" as const };
    const model = buildDashboardPageViewModel({
      preferences,
      selectedStream,
      streams: [selectedStream],
    });

    expect(model.cctvGridSize).toBe(3);
    expect(model.cctvStreams).toHaveLength(9);
    expect(model.cctvStatusSummary.online).toBe(1);
    expect(model.mapFocus.label).toContain("Mobile Front");
    expect(model.telemetryRows.length).toBeGreaterThan(0);
  });

  it("keeps talkback target toggling deterministic", () => {
    expect(toggleStringSetItem(["raw.a.front"], "raw.b.front")).toEqual(["raw.a.front", "raw.b.front"]);
    expect(toggleStringSetItem(["raw.a.front", "raw.b.front"], "raw.a.front")).toEqual(["raw.b.front"]);
  });

  it("updates active audio stream id only when playback audio state changes", () => {
    expect(nextAudioActiveStreamId(null, "raw.mobile.front", playbackSnapshot)).toBe("raw.mobile.front");
    expect(nextAudioActiveStreamId("raw.mobile.front", "raw.mobile.front", {
      ...playbackSnapshot,
      isAudioActive: false,
    })).toBeNull();
    expect(nextAudioActiveStreamId("raw.other.front", "raw.mobile.front", {
      ...playbackSnapshot,
      isAudioActive: false,
    })).toBe("raw.other.front");
  });
});

import { describe, expect, it } from "vitest";
import {
  DASHBOARD_STREAM_MODE,
  DASHBOARD_STREAM_STATUS,
} from "@/features/stateContracts";
import { createAudioAnalysisSnapshot, isSameAudioAnalysis } from "@dashboard/streaming/dashboardAudioAnalysis";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import type { RealtimePlayerSnapshot } from "@streaming/types";

const streams: DashboardStreamSlot[] = [
  {
    detail: "front",
    id: "stream-1",
    mode: DASHBOARD_STREAM_MODE.eo,
    status: DASHBOARD_STREAM_STATUS.online,
    streamPath: "stream-1",
    title: "Front EO",
  },
];

const snapshot: RealtimePlayerSnapshot = {
  audioJitterMs: 12,
  audioLevel: 0.42,
  audioPacketsLost: 0,
  errorMessage: null,
  hasAudioTrack: true,
  iceRoundTripTimeMs: 38,
  iceTransportProtocol: "udp",
  isAudioActive: true,
  localCandidateType: "srflx",
  mode: "webrtc",
  remoteCandidateType: "host",
  streamStatus: "online",
  webrtcFirstFrameLatencyMs: 140,
  webrtcWhepResponseMs: 31,
};

describe("dashboardAudioAnalysis", () => {
  it("creates a typed audio analysis snapshot from playback status", () => {
    const analysis = createAudioAnalysisSnapshot("stream-1", snapshot, streams);

    expect(analysis.title).toBe("Front EO");
    expect(analysis.isAudioActive).toBe(true);
    expect(analysis.localCandidateType).toBe("srflx");
  });

  it("keeps identical snapshots referentially stable for DashboardPage state", () => {
    const analysis = createAudioAnalysisSnapshot("stream-1", snapshot, streams);

    expect(isSameAudioAnalysis(analysis, { ...analysis })).toBe(true);
    expect(isSameAudioAnalysis(analysis, { ...analysis, audioLevel: 0.5 })).toBe(false);
  });
});

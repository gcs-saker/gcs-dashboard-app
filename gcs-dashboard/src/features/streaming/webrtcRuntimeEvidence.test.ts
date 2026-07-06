import { describe, expect, test } from "vitest";

import { buildWebRTCRuntimeEvidence } from "./webrtcRuntimeEvidence";
import type { WebRTCPlaybackSnapshot } from "./types";

describe("webrtcRuntimeEvidence", () => {
  test("classifies successful STUN/direct playback with first frame timing", () => {
    const evidence = buildWebRTCRuntimeEvidence(
      snapshot({
        hasVideoFrame: true,
        firstFrameLatencyMs: 184,
        signalingTimings: {
          ...snapshot({}).signalingTimings,
          whepResponseMs: 42,
          remoteDescriptionSetMs: 55,
        },
        audioStats: {
          ...snapshot({}).audioStats,
          localCandidateType: "srflx",
          remoteCandidateType: "host",
          roundTripTimeMs: 28,
        },
        iceCandidateStats: {
          total: 2,
          host: 1,
          srflx: 1,
          relay: 0,
          prflx: 0,
          unknown: 0,
          udp: 2,
          tcp: 0,
        },
      }),
    );

    expect(evidence).toMatchObject({
      icePath: "direct",
      relaySelected: false,
      hasFirstFrame: true,
      firstFrameLatencyMs: 184,
      whepResponseMs: 42,
      roundTripTimeMs: 28,
      signalingComplete: true,
    });
    expect(evidence.directCandidateCount).toBeGreaterThan(0);
    expect(evidence.relayCandidateCount).toBe(0);
  });

  test("classifies TURN relay fallback so relay pressure can be measured", () => {
    const evidence = buildWebRTCRuntimeEvidence(
      snapshot({
        audioStats: {
          ...snapshot({}).audioStats,
          localCandidateType: "relay",
          remoteCandidateType: "srflx",
          relayFallbackReason: "local-direct-candidate-failed",
        },
        iceCandidateStats: {
          total: 3,
          host: 1,
          srflx: 1,
          relay: 1,
          prflx: 0,
          unknown: 0,
          udp: 3,
          tcp: 0,
        },
      }),
    );

    expect(evidence).toMatchObject({
      icePath: "relay",
      relaySelected: true,
      relayFallbackReason: "local-direct-candidate-failed",
      hasFirstFrame: false,
    });
    expect(evidence.relayCandidateCount).toBe(2);
  });
});

function snapshot(overrides: Partial<WebRTCPlaybackSnapshot>): WebRTCPlaybackSnapshot {
  return {
    status: "loading",
    connectionState: "connecting",
    iceConnectionState: "checking",
    errorMessage: null,
    hasVideoFrame: false,
    hasAudioTrack: false,
    isAudioActive: false,
    audioPlaybackState: "no-track",
    audioDiagnosticMessage: "오디오 트랙 없음",
    firstFrameLatencyMs: null,
    signalingTimings: {
      iceServersLoadedMs: null,
      offerCreatedMs: null,
      localDescriptionSetMs: null,
      iceGatheringDoneMs: null,
      whepResponseMs: null,
      remoteDescriptionSetMs: null,
    },
    audioStats: {
      audioLevel: null,
      jitterMs: null,
      jitterBufferDelayMs: null,
      packetsLost: null,
      packetsReceived: null,
      concealedSamples: null,
      roundTripTimeMs: null,
      localCandidateType: null,
      remoteCandidateType: null,
      transportProtocol: null,
      relayFallbackReason: null,
    },
    ...overrides,
  };
}

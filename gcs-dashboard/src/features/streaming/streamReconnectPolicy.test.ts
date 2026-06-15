import { describe, expect, test } from "vitest";

import {
  describeWebRTCFailure,
  getNextWebRTCRetryDelay,
  isRecoverableWebRTCFailure,
  shouldSkipWebRTCRetryAfterRelayFailure,
  shouldFallbackAfterWebRTCRetry,
} from "./streamReconnectPolicy";
import type { WebRTCPlaybackSnapshot } from "./types";

describe("streamReconnectPolicy", () => {
  test("returns bounded WebRTC retry delays", () => {
    expect(getNextWebRTCRetryDelay(0, [100, 300])).toBe(100);
    expect(getNextWebRTCRetryDelay(1, [100, 300])).toBe(300);
    expect(getNextWebRTCRetryDelay(2, [100, 300])).toBeNull();
    expect(shouldFallbackAfterWebRTCRetry(2, [100, 300])).toBe(true);
  });

  test("treats failed, disconnected, and closed WebRTC states as recoverable interruptions", () => {
    expect(
      isRecoverableWebRTCFailure(snapshot({ status: "loading", connectionState: "disconnected" })),
    ).toBe(true);
    expect(isRecoverableWebRTCFailure(snapshot({ status: "loading", iceConnectionState: "closed" }))).toBe(true);
    expect(isRecoverableWebRTCFailure(snapshot({ status: "error" }))).toBe(true);
    expect(isRecoverableWebRTCFailure(snapshot({ status: "playing", connectionState: "connected" }))).toBe(false);
  });

  test("prefers the WebRTC error message when describing the failure", () => {
    expect(
      describeWebRTCFailure(
        snapshot({
          status: "error",
          errorMessage: "WHEP request failed with 503",
        }),
      ),
    ).toBe("WHEP request failed with 503");

    expect(describeWebRTCFailure(snapshot({ connectionState: "failed" }))).toBe(
      "WebRTC peer connection failed",
    );
  });

  test("skips repeated WebRTC retries after relay candidate failure", () => {
    expect(
      shouldSkipWebRTCRetryAfterRelayFailure(
        snapshot({
          status: "error",
          connectionState: "failed",
          audioStats: {
            ...snapshot({}).audioStats,
            localCandidateType: "relay",
            relayFallbackReason: "local-direct-candidate-failed",
          },
        }),
      ),
    ).toBe(true);
    expect(shouldSkipWebRTCRetryAfterRelayFailure(snapshot({ connectionState: "failed" }))).toBe(false);
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

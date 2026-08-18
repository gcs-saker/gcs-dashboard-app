import { describe, expect, it } from "vitest";
import { initialPlaybackState, playbackReducer } from "./whepPlaybackReducer";

describe("whepPlaybackReducer", () => {
  it("resets transient playback fields while entering loading", () => {
    const state = playbackReducer(
      {
        ...initialPlaybackState,
        status: "playing",
        hasVideoFrame: true,
        hasAudioTrack: true,
        isAudioActive: true,
      },
      { type: "loading", connectionState: "new", iceConnectionState: "new" },
    );

    expect(state.status).toBe("loading");
    expect(state.hasVideoFrame).toBe(false);
    expect(state.hasAudioTrack).toBe(false);
    expect(state.isAudioActive).toBe(false);
  });

  it("keeps object identity when audio state does not change", () => {
    const current = {
      ...initialPlaybackState,
      hasAudioTrack: true,
      isAudioActive: true,
    };

    expect(playbackReducer(current, { type: "audio-state", hasAudioTrack: true, isAudioActive: true })).toBe(current);
  });

  it("rounds first frame and signaling timings", () => {
    const withFirstFrame = playbackReducer(initialPlaybackState, { type: "first-frame", latencyMs: 42.6 });
    const withTiming = playbackReducer(withFirstFrame, {
      type: "signaling-timing",
      stage: "whepResponseMs",
      latencyMs: 19.4,
    });

    expect(withFirstFrame.hasVideoFrame).toBe(true);
    expect(withFirstFrame.firstFrameLatencyMs).toBe(43);
    expect(withTiming.signalingTimings.whepResponseMs).toBe(19);
  });

  it("preserves playback evidence when entering error state", () => {
    const current = {
      ...initialPlaybackState,
      hasVideoFrame: true,
      firstFrameLatencyMs: 51,
    };

    const next = playbackReducer(current, {
      type: "error",
      message: "WHEP failed",
      connectionState: "failed",
      iceConnectionState: "failed",
    });

    expect(next.status).toBe("error");
    expect(next.errorMessage).toBe("WHEP failed");
    expect(next.hasVideoFrame).toBe(true);
    expect(next.firstFrameLatencyMs).toBe(51);
  });

  it("keeps object identity when audio stats do not change", () => {
    expect(playbackReducer(initialPlaybackState, {
      type: "audio-level",
      audioLevel: initialPlaybackState.audioStats.audioLevel,
      waveform: [],
    })).toBe(initialPlaybackState);
  });
});

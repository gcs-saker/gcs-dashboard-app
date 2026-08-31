import { describe, expect, test } from "vitest";

import { hlsPlaybackReducer, initialHlsPlaybackState } from "@streaming/hooks/playback/hlsPlaybackReducer";

describe("hlsPlaybackReducer", () => {
  test("moves to loading state while preserving mode and latency policy", () => {
    expect(
      hlsPlaybackReducer(initialHlsPlaybackState, {
        type: "loading",
        mode: "hlsjs",
        latencyMode: "low-latency",
      }),
    ).toEqual({
      status: "loading",
      mode: "hlsjs",
      latencyMode: "low-latency",
      errorMessage: null,
    });
  });

  test("clears previous error when playback starts", () => {
    const errored = hlsPlaybackReducer(initialHlsPlaybackState, {
      type: "error",
      mode: "hlsjs",
      latencyMode: "stable",
      message: "HLS playback failed",
    });

    expect(
      hlsPlaybackReducer(errored, {
        type: "playing",
        mode: "native",
        latencyMode: "stable",
      }),
    ).toEqual({
      status: "playing",
      mode: "native",
      latencyMode: "stable",
      errorMessage: null,
    });
  });

  test("keeps a user-visible error message for unsupported or failed playback", () => {
    expect(
      hlsPlaybackReducer(initialHlsPlaybackState, {
        type: "error",
        mode: "unsupported",
        latencyMode: "stable",
        message: "HLS playback is not supported in this browser",
      }),
    ).toEqual({
      status: "error",
      mode: "unsupported",
      latencyMode: "stable",
      errorMessage: "HLS playback is not supported in this browser",
    });
  });
});

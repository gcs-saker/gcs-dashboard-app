import { describe, expect, test } from "vitest";

import {
  initialRealtimePlaybackState,
  realtimePlaybackReducer,
} from "./realtimePlaybackState";

const onlinePlayback = {
  streamId: "raw.local.webcam",
  status: "online" as const,
  playbackUrls: {
    webrtc: "https://media.example.test/webrtc/raw/local/webcam/whep",
    hls: "https://media.example.test/hls/raw/local/webcam/index.m3u8",
  },
};

describe("realtimePlaybackState", () => {
  test("selects WebRTC first when a realtime playback URL is available", () => {
    expect(realtimePlaybackReducer(initialRealtimePlaybackState, { type: "loaded", playback: onlinePlayback })).toMatchObject({
      mode: "webrtc",
      streamStatus: "online",
      errorMessage: null,
      webrtcRetryAttempt: 0,
      playback: onlinePlayback,
    });
  });

  test("falls back to HLS when WebRTC URL is unavailable", () => {
    const playback = {
      ...onlinePlayback,
      playbackUrls: { webrtc: null, hls: onlinePlayback.playbackUrls.hls },
    };

    expect(realtimePlaybackReducer(initialRealtimePlaybackState, { type: "loaded", playback })).toMatchObject({
      mode: "hls",
      fallbackReason: "WebRTC URL is unavailable. Playing HLS fallback.",
    });
  });

  test("schedules bounded WebRTC retry before HLS fallback", () => {
    const loaded = realtimePlaybackReducer(initialRealtimePlaybackState, { type: "loaded", playback: onlinePlayback });
    const reconnecting = realtimePlaybackReducer(loaded, {
      type: "schedule-webrtc-retry",
      reason: "WebRTC disconnected",
      reconnectDelaysMs: [100, 200],
    });
    const retrying = realtimePlaybackReducer(reconnecting, { type: "retry-webrtc" });
    const fallback = realtimePlaybackReducer(
      { ...retrying, webrtcRetryAttempt: 2 },
      {
        type: "schedule-webrtc-retry",
        reason: "WebRTC disconnected again",
        reconnectDelaysMs: [100, 200],
      },
    );

    expect(reconnecting).toMatchObject({
      mode: "reconnecting",
      reconnectDelayMs: 100,
      errorMessage: "WebRTC disconnected",
    });
    expect(retrying).toMatchObject({ mode: "webrtc", webrtcRetryAttempt: 1 });
    expect(fallback).toMatchObject({ mode: "hls", fallbackReason: "WebRTC disconnected again" });
  });

  test("keeps offline and error states explicit for UI rendering", () => {
    const offlinePlayback = { ...onlinePlayback, status: "offline" as const };
    const offline = realtimePlaybackReducer(initialRealtimePlaybackState, {
      type: "offline",
      playback: offlinePlayback,
    });
    const errored = realtimePlaybackReducer(offline, {
      type: "error",
      message: "Playback API request failed",
    });

    expect(offline).toMatchObject({ mode: "offline", streamStatus: "offline", playback: offlinePlayback });
    expect(errored).toMatchObject({ mode: "error", streamStatus: "offline", errorMessage: "Playback API request failed" });
  });
});

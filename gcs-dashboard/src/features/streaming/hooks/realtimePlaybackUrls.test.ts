import { describe, expect, test } from "vitest";

import { normalizeBrowserMediaUrl, normalizePlaybackResponse } from "./realtimePlaybackUrls";

describe("realtimePlaybackUrls", () => {
  test("rewrites localhost media URLs to the deployed page origin", () => {
    expect(normalizeBrowserMediaUrl("http://localhost:8080/webrtc/raw/local/webcam/whep", "https://gcs.example.test/")).toBe(
      "https://gcs.example.test/webrtc/raw/local/webcam/whep",
    );
  });

  test("upgrades insecure same-host media URLs when the dashboard is served over HTTPS", () => {
    expect(normalizeBrowserMediaUrl("http://gcs.example.test/webrtc/raw/local/webcam/whep", "https://gcs.example.test/")).toBe(
      "https://gcs.example.test/webrtc/raw/local/webcam/whep",
    );
  });

  test("leaves external and null media URLs unchanged", () => {
    expect(normalizeBrowserMediaUrl("https://media.example.test/whep", "https://gcs.example.test/")).toBe(
      "https://media.example.test/whep",
    );
    expect(normalizeBrowserMediaUrl(null, "https://gcs.example.test/")).toBeNull();
  });

  test("normalizes a playback response without changing its stream contract", () => {
    const playback = normalizePlaybackResponse({
      streamId: "raw.local.webcam",
      status: "online",
      playbackUrls: {
        webrtc: "https://media.example.test/webrtc/raw/local/webcam/whep",
        hls: "https://media.example.test/hls/raw/local/webcam/index.m3u8",
      },
    });

    expect(playback).toEqual({
      streamId: "raw.local.webcam",
      status: "online",
      playbackUrls: {
        webrtc: "https://media.example.test/webrtc/raw/local/webcam/whep",
        hls: "https://media.example.test/hls/raw/local/webcam/index.m3u8",
      },
    });
  });
});

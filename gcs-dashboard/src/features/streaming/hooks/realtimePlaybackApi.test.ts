import { afterEach, describe, expect, test, vi } from "vitest";

import { fetchPlaybackWithReadyRetry, isStreamPlaybackResponse, PlaybackApiError } from "./realtimePlaybackApi";

const playbackPayload = {
  streamId: "raw.local.webcam",
  status: "online",
  playbackUrls: {
    webrtc: "https://media.example.test/webrtc/raw/local/webcam/whep",
    hls: "https://media.example.test/hls/raw/local/webcam/index.m3u8",
  },
};

function jsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => payload),
  } as unknown as Response;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("realtimePlaybackApi", () => {
  test("validates playback response DTO shape", () => {
    expect(isStreamPlaybackResponse(playbackPayload)).toBe(true);
    expect(isStreamPlaybackResponse({ ...playbackPayload, status: "broken" })).toBe(false);
    expect(isStreamPlaybackResponse({ ...playbackPayload, playbackUrls: { webrtc: 1, hls: null } })).toBe(false);
  });

  test("fetches playback URL through authenticated media-control API", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, playbackPayload));
    const abortController = new AbortController();

    await expect(fetchPlaybackWithReadyRetry("raw.local.webcam", fetcher, abortController.signal, [])).resolves.toEqual(playbackPayload);
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/streams/raw.local.webcam/playback"),
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "application/json" },
        signal: abortController.signal,
      }),
    );
  });

  test("retries readiness statuses before returning playback", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(404, { error: "not ready" }))
      .mockResolvedValueOnce(jsonResponse(200, playbackPayload));
    const abortController = new AbortController();
    const playbackPromise = fetchPlaybackWithReadyRetry("raw.local.webcam", fetcher, abortController.signal, [25]);

    await vi.advanceTimersByTimeAsync(25);

    await expect(playbackPromise).resolves.toEqual(playbackPayload);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("throws typed errors for non-retryable API failures", async () => {
    const fetcher = vi.fn(async () => jsonResponse(403, { error: "forbidden" }));
    const abortController = new AbortController();

    await expect(fetchPlaybackWithReadyRetry("raw.local.webcam", fetcher, abortController.signal, [25])).rejects.toBeInstanceOf(
      PlaybackApiError,
    );
  });

  test("rejects invalid playback DTOs before the player renders", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, { streamId: "raw.local.webcam" }));
    const abortController = new AbortController();

    await expect(fetchPlaybackWithReadyRetry("raw.local.webcam", fetcher, abortController.signal, [])).rejects.toThrow(
      "Playback API response is invalid",
    );
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isRetryableWhepStatus,
  postWhepOfferWithReadyRetry,
} from "./whepOfferClient";
import type { SignalingTimingRecorder } from "./whepPlaybackContracts";

describe("whepOfferClient", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("classifies retryable WHEP readiness statuses", () => {
    expect(isRetryableWhepStatus(404)).toBe(true);
    expect(isRetryableWhepStatus(409)).toBe(true);
    expect(isRetryableWhepStatus(425)).toBe(true);
    expect(isRetryableWhepStatus(503)).toBe(true);
    expect(isRetryableWhepStatus(401)).toBe(false);
    expect(isRetryableWhepStatus(500)).toBe(false);
  });

  it("posts SDP offer and records WHEP response timing", async () => {
    const response = responseWithStatus(201);
    const fetcher = vi.fn(async () => response) as unknown as typeof fetch;
    const recordTiming = vi.fn() as SignalingTimingRecorder;
    const signal = new AbortController().signal;

    await expect(postWhepOfferWithReadyRetry("/webrtc/raw/local/whep", "v=0", fetcher, signal, recordTiming)).resolves.toBe(response);

    expect(fetcher).toHaveBeenCalledWith(
      "/webrtc/raw/local/whep",
      expect.objectContaining({
        method: "POST",
        headers: { Accept: "application/sdp", "Content-Type": "application/sdp" },
        body: "v=0",
        signal,
      }),
    );
    expect(recordTiming).toHaveBeenCalledWith("whepResponseMs");
  });

  it("retries readiness failures before returning a successful response", async () => {
    vi.useFakeTimers();
    const response = responseWithStatus(201);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(responseWithStatus(404))
      .mockResolvedValueOnce(response);
    const waiting = postWhepOfferWithReadyRetry(
      "/webrtc/raw/local/whep",
      "v=0",
      fetcher as unknown as typeof fetch,
      new AbortController().signal,
      vi.fn() as SignalingTimingRecorder,
    );

    await vi.advanceTimersByTimeAsync(500);

    await expect(waiting).resolves.toBe(response);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-readiness failures", async () => {
    const fetcher = vi.fn(async () => responseWithStatus(401)) as unknown as typeof fetch;

    await expect(
      postWhepOfferWithReadyRetry(
        "/webrtc/raw/local/whep",
        "v=0",
        fetcher,
        new AbortController().signal,
        vi.fn() as SignalingTimingRecorder,
      ),
    ).rejects.toThrow("WHEP request failed with 401");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects retry sleep when playback is aborted", async () => {
    vi.useFakeTimers();
    const abortController = new AbortController();
    const fetcher = vi.fn(async () => responseWithStatus(404)) as unknown as typeof fetch;
    const waiting = postWhepOfferWithReadyRetry(
      "/webrtc/raw/local/whep",
      "v=0",
      fetcher,
      abortController.signal,
      vi.fn() as SignalingTimingRecorder,
    );
    const expectedFailure = expect(waiting).rejects.toThrow("WebRTC playback was aborted");

    abortController.abort();
    await vi.advanceTimersByTimeAsync(0);

    await expectedFailure;
  });
});

function responseWithStatus(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
  } as Response;
}

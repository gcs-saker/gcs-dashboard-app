import { streamApiV1Url } from "@/config";
import { authenticatedFetch } from "@auth/authApi";
import type { StreamPlaybackResponse, StreamPlaybackUrls, StreamRuntimeStatus } from "@streaming/types";
import { STREAM_JSON_ACCEPT_HEADERS } from "@streaming/streamingProtocolHeaders";

const PLAYBACK_READY_RETRY_STATUS = Object.freeze(new Set([404, 409, 425, 503]));

export class PlaybackApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Playback API request failed with ${status}`);
    this.name = "PlaybackApiError";
    this.status = status;
  }
}

export async function fetchPlaybackWithReadyRetry(
  streamId: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
  retryDelaysMs: readonly number[],
): Promise<StreamPlaybackResponse> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetchPlayback(streamId, fetcher, signal);
    } catch (error) {
      if (
        signal.aborted ||
        !(error instanceof PlaybackApiError) ||
        !PLAYBACK_READY_RETRY_STATUS.has(error.status) ||
        attempt >= retryDelaysMs.length
      ) {
        throw error;
      }
      await waitUnlessAborted(retryDelaysMs[attempt], signal);
    }
  }
}

export function isStreamPlaybackResponse(payload: unknown): payload is StreamPlaybackResponse {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<StreamPlaybackResponse>;
  const playbackUrls = candidate.playbackUrls as Partial<StreamPlaybackUrls> | undefined;
  return (
    typeof candidate.streamId === "string" &&
    isStreamRuntimeStatus(candidate.status) &&
    !!playbackUrls &&
    (typeof playbackUrls.webrtc === "string" || playbackUrls.webrtc === null) &&
    (typeof playbackUrls.hls === "string" || playbackUrls.hls === null)
  );
}

async function fetchPlayback(
  streamId: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<StreamPlaybackResponse> {
  const response = await authenticatedFetch(streamApiV1Url(`/streams/${encodeURIComponent(streamId)}/playback`), {
    method: "GET",
    headers: STREAM_JSON_ACCEPT_HEADERS,
    signal,
  }, fetcher);

  if (!response.ok) {
    throw new PlaybackApiError(response.status);
  }

  const payload = await response.json();
  if (!isStreamPlaybackResponse(payload)) {
    throw new Error("Playback API response is invalid");
  }

  return payload;
}

function waitUnlessAborted(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const timeoutId = globalThis.setTimeout(finish, delayMs);
    const abort = () => {
      globalThis.clearTimeout(timeoutId);
      finish();
    };
    signal.addEventListener(
      "abort",
      abort,
      { once: true },
    );
  });
}

function isStreamRuntimeStatus(status: unknown): status is StreamRuntimeStatus {
  return status === "registered" || status === "online" || status === "offline" || status === "unknown";
}

import { useEffect, useReducer } from "react";

import { streamApiV1Url } from "../../../config";
import { authenticatedFetch } from "../../auth/authApi";
import type {
  RealtimePlayerMode,
  RealtimePlayerSnapshot,
  StreamPlaybackResponse,
  StreamPlaybackUrls,
  StreamRuntimeStatus,
} from "../types";
import {
  DEFAULT_WEBRTC_RECONNECT_DELAYS_MS,
  getNextWebRTCRetryDelay,
  shouldFallbackAfterWebRTCRetry,
} from "../streamReconnectPolicy";

interface UseRealtimePlaybackOptions {
  streamId: string;
  fetcher?: typeof fetch;
  reconnectDelaysMs?: readonly number[];
}

type RealtimeAction =
  | { type: "loading" }
  | { type: "loaded"; playback: StreamPlaybackResponse }
  | { type: "use-webrtc" }
  | { type: "use-hls"; reason: string }
  | { type: "schedule-webrtc-retry"; reason: string; reconnectDelaysMs: readonly number[] }
  | { type: "retry-webrtc" }
  | { type: "offline"; playback: StreamPlaybackResponse }
  | { type: "error"; message: string; streamStatus?: StreamRuntimeStatus | "unknown" };

interface RealtimeState extends RealtimePlayerSnapshot {
  playback: StreamPlaybackResponse | null;
  fallbackReason: string;
  reconnectDelayMs: number | null;
  webrtcRetryAttempt: number;
}

const initialState: RealtimeState = {
  mode: "loading",
  streamStatus: "unknown",
  errorMessage: null,
  playback: null,
  fallbackReason: "WebRTC failed. Playing HLS fallback.",
  reconnectDelayMs: null,
  webrtcRetryAttempt: 0,
};

export function useRealtimePlayback({
  streamId,
  fetcher = fetch,
  reconnectDelaysMs = DEFAULT_WEBRTC_RECONNECT_DELAYS_MS,
}: UseRealtimePlaybackOptions): RealtimeState & {
  useWebRTC: () => void;
  useHLSFallback: (reason: string) => void;
  scheduleWebRTCRetry: (reason: string) => void;
} {
  const [state, dispatch] = useReducer(realtimeReducer, initialState);

  useEffect(() => {
    const abortController = new AbortController();

    dispatch({ type: "loading" });

    void fetchPlayback(streamId, fetcher, abortController.signal)
      .then((playback) => {
        if (playback.status === "offline") {
          dispatch({ type: "offline", playback });
          return;
        }

        dispatch({ type: "loaded", playback });
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        dispatch({
          type: "error",
          message: error instanceof Error ? error.message : "Playback API request failed",
        });
      });

    return () => {
      abortController.abort();
    };
  }, [fetcher, streamId]);

  useEffect(() => {
    if (state.mode !== "reconnecting" || state.reconnectDelayMs === null) {
      return undefined;
    }

    const timeoutId = globalThis.setTimeout(() => {
      dispatch({ type: "retry-webrtc" });
    }, state.reconnectDelayMs);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [state.mode, state.reconnectDelayMs]);

  return {
    ...state,
    useWebRTC: () => dispatch({ type: "use-webrtc" }),
    useHLSFallback: (reason: string) => dispatch({ type: "use-hls", reason }),
    scheduleWebRTCRetry: (reason: string) =>
      dispatch({ type: "schedule-webrtc-retry", reason, reconnectDelaysMs }),
  };
}

export function normalizeBrowserMediaUrl(url: string | null, pageHref?: string): string | null {
  if (!url || typeof window === "undefined") return url;

  const resolvedPageHref = pageHref ?? window.location.href;
  const pageUrl = new URL(resolvedPageHref);
  const mediaUrl = new URL(url, pageUrl.href);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const isLocalMediaUrl = localHosts.has(mediaUrl.hostname);
  const isLocalPage = localHosts.has(pageUrl.hostname);

  if (isLocalMediaUrl && !isLocalPage) {
    return `${pageUrl.origin}${mediaUrl.pathname}${mediaUrl.search}${mediaUrl.hash}`;
  }

  if (pageUrl.protocol === "https:" && mediaUrl.protocol === "http:" && mediaUrl.hostname === pageUrl.hostname) {
    mediaUrl.protocol = "https:";
    return mediaUrl.toString();
  }

  return url;
}

function realtimeReducer(state: RealtimeState, action: RealtimeAction): RealtimeState {
  switch (action.type) {
    case "loading":
      return {
        ...initialState,
      };
    case "loaded":
      return {
        ...state,
        mode: normalizeBrowserMediaUrl(action.playback.playbackUrls.webrtc) ? "webrtc" : "hls",
        streamStatus: action.playback.status,
        errorMessage: null,
        playback: normalizePlaybackResponse(action.playback),
        reconnectDelayMs: null,
        webrtcRetryAttempt: 0,
        fallbackReason: normalizeBrowserMediaUrl(action.playback.playbackUrls.webrtc)
          ? initialState.fallbackReason
          : "WebRTC URL is unavailable. Playing HLS fallback.",
      };
    case "use-webrtc":
      return {
        ...state,
        mode: "webrtc",
        errorMessage: null,
        reconnectDelayMs: null,
        webrtcRetryAttempt: 0,
      };
    case "use-hls":
      return {
        ...state,
        mode: state.playback?.playbackUrls.hls ? "hls" : "error",
        errorMessage: state.playback?.playbackUrls.hls ? null : action.reason,
        fallbackReason: action.reason,
        reconnectDelayMs: null,
      };
    case "schedule-webrtc-retry": {
      if (!state.playback?.playbackUrls.hls || shouldFallbackAfterWebRTCRetry(state.webrtcRetryAttempt, action.reconnectDelaysMs)) {
        return {
          ...state,
          mode: state.playback?.playbackUrls.hls ? "hls" : "error",
          errorMessage: state.playback?.playbackUrls.hls ? null : action.reason,
          fallbackReason: action.reason,
          reconnectDelayMs: null,
        };
      }

      return {
        ...state,
        mode: "reconnecting",
        errorMessage: action.reason,
        fallbackReason: action.reason,
        reconnectDelayMs: getNextWebRTCRetryDelay(state.webrtcRetryAttempt, action.reconnectDelaysMs),
      };
    }
    case "retry-webrtc":
      return {
        ...state,
        mode: "webrtc",
        errorMessage: null,
        reconnectDelayMs: null,
        webrtcRetryAttempt: state.webrtcRetryAttempt + 1,
      };
    case "offline":
      return {
        ...state,
        mode: "offline",
        streamStatus: action.playback.status,
        errorMessage: null,
        playback: action.playback,
        reconnectDelayMs: null,
      };
    case "error":
      return {
        ...state,
        mode: "error",
        streamStatus: action.streamStatus ?? state.streamStatus,
        errorMessage: action.message,
      };
  }
}

function normalizePlaybackResponse(playback: StreamPlaybackResponse): StreamPlaybackResponse {
  return {
    ...playback,
    playbackUrls: {
      webrtc: normalizeBrowserMediaUrl(playback.playbackUrls.webrtc),
      hls: normalizeBrowserMediaUrl(playback.playbackUrls.hls),
    },
  };
}

async function fetchPlayback(
  streamId: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<StreamPlaybackResponse> {
  const response = await authenticatedFetch(streamApiV1Url(`/streams/${encodeURIComponent(streamId)}/playback`), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal,
  }, fetcher);

  if (!response.ok) {
    throw new Error(`Playback API request failed with ${response.status}`);
  }

  const payload = await response.json();
  if (!isStreamPlaybackResponse(payload)) {
    throw new Error("Playback API response is invalid");
  }

  return payload;
}

function isStreamPlaybackResponse(payload: unknown): payload is StreamPlaybackResponse {
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

function isStreamRuntimeStatus(status: unknown): status is StreamRuntimeStatus {
  return status === "registered" || status === "online" || status === "offline" || status === "unknown";
}

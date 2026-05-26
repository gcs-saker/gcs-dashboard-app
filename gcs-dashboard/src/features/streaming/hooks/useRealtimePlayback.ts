import { useEffect, useReducer } from "react";

import { apiV1Url } from "../../../config";
import { buildAuthHeaders } from "../../auth/authApi";
import type {
  RealtimePlayerMode,
  RealtimePlayerSnapshot,
  StreamPlaybackResponse,
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

function realtimeReducer(state: RealtimeState, action: RealtimeAction): RealtimeState {
  switch (action.type) {
    case "loading":
      return {
        ...initialState,
      };
    case "loaded":
      return {
        ...state,
        mode: action.playback.playbackUrls.webrtc ? "webrtc" : "hls",
        streamStatus: action.playback.status,
        errorMessage: null,
        playback: action.playback,
        reconnectDelayMs: null,
        webrtcRetryAttempt: 0,
        fallbackReason: action.playback.playbackUrls.webrtc
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

async function fetchPlayback(
  streamId: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<StreamPlaybackResponse> {
  const response = await fetcher(apiV1Url(`/streams/${encodeURIComponent(streamId)}/playback`), {
    method: "GET",
    headers: buildAuthHeaders({
      Accept: "application/json",
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Playback API request failed with ${response.status}`);
  }

  return (await response.json()) as StreamPlaybackResponse;
}

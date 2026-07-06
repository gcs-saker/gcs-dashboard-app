import { useEffect, useReducer } from "react";

import { DEFAULT_WEBRTC_RECONNECT_DELAYS_MS } from "@streaming/streamReconnectPolicy";
import { fetchPlaybackWithReadyRetry } from "./realtimePlaybackApi";
import {
  initialRealtimePlaybackState,
  realtimePlaybackReducer,
  type RealtimePlaybackHookResult,
} from "./realtimePlaybackState";

interface UseRealtimePlaybackOptions {
  streamId: string;
  fetcher?: typeof fetch;
  reconnectDelaysMs?: readonly number[];
  playbackReadyRetryDelaysMs?: readonly number[];
}

const PLAYBACK_READY_RETRY_DELAYS_MS = Object.freeze([500, 1000, 2000] as const);

export function useRealtimePlayback({
  streamId,
  fetcher = fetch,
  reconnectDelaysMs = DEFAULT_WEBRTC_RECONNECT_DELAYS_MS,
  playbackReadyRetryDelaysMs = PLAYBACK_READY_RETRY_DELAYS_MS,
}: UseRealtimePlaybackOptions): RealtimePlaybackHookResult {
  const [state, dispatch] = useReducer(realtimePlaybackReducer, initialRealtimePlaybackState);

  useEffect(() => {
    const abortController = new AbortController();

    dispatch({ type: "loading" });

    void fetchPlaybackWithReadyRetry(streamId, fetcher, abortController.signal, playbackReadyRetryDelaysMs)
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
  }, [fetcher, playbackReadyRetryDelaysMs, streamId]);

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

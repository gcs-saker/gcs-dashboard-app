import { useEffect, useReducer } from "react";

import { apiUrl } from "../../../config";
import type {
  RealtimePlayerMode,
  RealtimePlayerSnapshot,
  StreamPlaybackResponse,
  StreamRuntimeStatus,
} from "../types";

interface UseRealtimePlaybackOptions {
  streamId: string;
  fetcher?: typeof fetch;
}

type RealtimeAction =
  | { type: "loading" }
  | { type: "loaded"; playback: StreamPlaybackResponse }
  | { type: "use-webrtc" }
  | { type: "use-hls"; reason: string }
  | { type: "offline"; playback: StreamPlaybackResponse }
  | { type: "error"; message: string; streamStatus?: StreamRuntimeStatus | "unknown" };

interface RealtimeState extends RealtimePlayerSnapshot {
  playback: StreamPlaybackResponse | null;
  fallbackReason: string;
}

const initialState: RealtimeState = {
  mode: "loading",
  streamStatus: "unknown",
  errorMessage: null,
  playback: null,
  fallbackReason: "WebRTC failed. Playing HLS fallback.",
};

export function useRealtimePlayback({
  streamId,
  fetcher = fetch,
}: UseRealtimePlaybackOptions): RealtimeState & {
  useWebRTC: () => void;
  useHLSFallback: (reason: string) => void;
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

  return {
    ...state,
    useWebRTC: () => dispatch({ type: "use-webrtc" }),
    useHLSFallback: (reason: string) => dispatch({ type: "use-hls", reason }),
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
        fallbackReason: action.playback.playbackUrls.webrtc
          ? initialState.fallbackReason
          : "WebRTC URL is unavailable. Playing HLS fallback.",
      };
    case "use-webrtc":
      return {
        ...state,
        mode: "webrtc",
        errorMessage: null,
      };
    case "use-hls":
      return {
        ...state,
        mode: state.playback?.playbackUrls.hls ? "hls" : "error",
        errorMessage: state.playback?.playbackUrls.hls ? null : action.reason,
        fallbackReason: action.reason,
      };
    case "offline":
      return {
        ...state,
        mode: "offline",
        streamStatus: action.playback.status,
        errorMessage: null,
        playback: action.playback,
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
  const response = await fetcher(apiUrl(`/v1/streams/${encodeURIComponent(streamId)}/playback`), {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Playback API request failed with ${response.status}`);
  }

  return (await response.json()) as StreamPlaybackResponse;
}

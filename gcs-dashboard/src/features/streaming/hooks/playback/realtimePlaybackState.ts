import type {
  RealtimePlayerMode,
  RealtimePlayerSnapshot,
  StreamPlaybackResponse,
  StreamRuntimeStatus,
} from "@streaming/types";
import {
  getNextWebRTCRetryDelay,
  shouldFallbackAfterWebRTCRetry,
} from "@streaming/runtime/streamReconnectPolicy";
import { normalizeBrowserMediaUrl, normalizePlaybackResponse } from "@streaming/hooks/playback/realtimePlaybackUrls";

export type RealtimePlaybackAction =
  | { type: "loading" }
  | { type: "loaded"; playback: StreamPlaybackResponse }
  | { type: "use-webrtc" }
  | { type: "use-hls"; reason: string }
  | { type: "schedule-webrtc-retry"; reason: string; reconnectDelaysMs: readonly number[] }
  | { type: "retry-webrtc" }
  | { type: "offline"; playback: StreamPlaybackResponse }
  | { type: "error"; message: string; streamStatus?: StreamRuntimeStatus | "unknown" };

export interface RealtimePlaybackState extends RealtimePlayerSnapshot {
  playback: StreamPlaybackResponse | null;
  fallbackReason: string;
  reconnectDelayMs: number | null;
  webrtcRetryAttempt: number;
}

export interface RealtimePlaybackControls {
  useWebRTC: () => void;
  useHLSFallback: (reason: string) => void;
  scheduleWebRTCRetry: (reason: string) => void;
}

export type RealtimePlaybackHookResult = RealtimePlaybackState & RealtimePlaybackControls;

export const initialRealtimePlaybackState: RealtimePlaybackState = Object.freeze({
  mode: "loading" satisfies RealtimePlayerMode,
  streamStatus: "unknown",
  errorMessage: null,
  playback: null,
  fallbackReason: "WebRTC failed. Playing HLS fallback.",
  reconnectDelayMs: null,
  webrtcRetryAttempt: 0,
});

export function realtimePlaybackReducer(
  state: RealtimePlaybackState,
  action: RealtimePlaybackAction,
): RealtimePlaybackState {
  switch (action.type) {
    case "loading":
      return {
        ...initialRealtimePlaybackState,
      };
    case "loaded":
      return loadedState(state, action.playback);
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
    case "schedule-webrtc-retry":
      return scheduleWebRtcRetryState(state, action.reason, action.reconnectDelaysMs);
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

function loadedState(
  state: RealtimePlaybackState,
  playback: StreamPlaybackResponse,
): RealtimePlaybackState {
  const normalizedPlayback = normalizePlaybackResponse(playback);
  const hasWebRtcUrl = !!normalizeBrowserMediaUrl(playback.playbackUrls.webrtc);
  return {
    ...state,
    mode: hasWebRtcUrl ? "webrtc" : "hls",
    streamStatus: playback.status,
    errorMessage: null,
    playback: normalizedPlayback,
    reconnectDelayMs: null,
    webrtcRetryAttempt: 0,
    fallbackReason: hasWebRtcUrl
      ? initialRealtimePlaybackState.fallbackReason
      : "WebRTC URL is unavailable. Playing HLS fallback.",
  };
}

function scheduleWebRtcRetryState(
  state: RealtimePlaybackState,
  reason: string,
  reconnectDelaysMs: readonly number[],
): RealtimePlaybackState {
  if (!state.playback?.playbackUrls.hls || shouldFallbackAfterWebRTCRetry(state.webrtcRetryAttempt, reconnectDelaysMs)) {
    return {
      ...state,
      mode: state.playback?.playbackUrls.hls ? "hls" : "error",
      errorMessage: state.playback?.playbackUrls.hls ? null : reason,
      fallbackReason: reason,
      reconnectDelayMs: null,
    };
  }

  return {
    ...state,
    mode: "reconnecting",
    errorMessage: reason,
    fallbackReason: reason,
    reconnectDelayMs: getNextWebRTCRetryDelay(state.webrtcRetryAttempt, reconnectDelaysMs),
  };
}

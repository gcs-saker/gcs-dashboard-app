import type { HLSFallbackSnapshot, HLSLatencyMode, HLSPlaybackMode } from "@streaming/types";

export type HlsPlaybackAction =
  | { type: "loading"; mode: HLSPlaybackMode; latencyMode: HLSLatencyMode }
  | { type: "playing"; mode: HLSPlaybackMode; latencyMode: HLSLatencyMode }
  | { type: "error"; mode: HLSPlaybackMode; latencyMode: HLSLatencyMode; message: string };

export const initialHlsPlaybackState: HLSFallbackSnapshot = Object.freeze({
  status: "idle",
  mode: "unsupported",
  latencyMode: "stable",
  errorMessage: null,
});

export function hlsPlaybackReducer(
  state: HLSFallbackSnapshot,
  action: HlsPlaybackAction,
): HLSFallbackSnapshot {
  switch (action.type) {
    case "loading":
      return {
        status: "loading",
        mode: action.mode,
        latencyMode: action.latencyMode,
        errorMessage: null,
      };
    case "playing":
      return {
        status: "playing",
        mode: action.mode,
        latencyMode: action.latencyMode,
        errorMessage: null,
      };
    case "error":
      return {
        status: "error",
        mode: action.mode,
        latencyMode: action.latencyMode,
        errorMessage: action.message,
      };
  }

  return state;
}

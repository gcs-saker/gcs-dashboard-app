import { useEffect, useReducer, useRef } from "react";
import type { RefObject } from "react";

import type { HLSFallbackSnapshot, HLSLatencyMode, HLSPlaybackMode } from "../types";

type HlsConstructor = typeof import("hls.js").default;

interface UseHlsFallbackPlaybackOptions {
  hlsUrl: string | null;
  latencyMode?: HLSLatencyMode;
}

type HlsAction =
  | { type: "loading"; mode: HLSPlaybackMode; latencyMode: HLSLatencyMode }
  | { type: "playing"; mode: HLSPlaybackMode; latencyMode: HLSLatencyMode }
  | { type: "error"; mode: HLSPlaybackMode; latencyMode: HLSLatencyMode; message: string };

const initialHlsState: HLSFallbackSnapshot = {
  status: "idle",
  mode: "unsupported",
  latencyMode: "stable",
  errorMessage: null,
};

export function useHlsFallbackPlayback({
  hlsUrl,
  latencyMode = "stable",
}: UseHlsFallbackPlaybackOptions): HLSFallbackSnapshot & {
  videoRef: RefObject<HTMLVideoElement | null>;
} {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [snapshot, dispatch] = useReducer(hlsReducer, initialHlsState);

  useEffect(() => {
    const video = videoRef.current;

    if (!video) {
      return undefined;
    }

    if (!hlsUrl) {
      dispatch({ type: "error", mode: "unsupported", latencyMode, message: "HLS URL is required" });
      return undefined;
    }

    let disposed = false;
    let cleanup: (() => void) | undefined;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      const onLoadedMetadata = () => {
        void video.play();
        dispatch({ type: "playing", mode: "native", latencyMode });
      };

      dispatch({ type: "loading", mode: "native", latencyMode });
      video.src = hlsUrl;
      video.addEventListener("loadedmetadata", onLoadedMetadata);
      cleanup = () => {
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeAttribute("src");
      };
      return () => {
        disposed = true;
        cleanup?.();
      };
    }

    void loadHlsConstructor()
      .then((Hls) => {
        if (disposed) {
          return;
        }

        if (!Hls.isSupported()) {
          dispatch({
            type: "error",
            mode: "unsupported",
            latencyMode,
            message: "HLS playback is not supported in this browser",
          });
          return;
        }

        const hls = new Hls(hlsConfigForLatencyMode(latencyMode));

        dispatch({ type: "loading", mode: "hlsjs", latencyMode });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          void video.play();
          dispatch({ type: "playing", mode: "hlsjs", latencyMode });
        });
        hls.on(Hls.Events.ERROR, () => {
          dispatch({ type: "error", mode: "hlsjs", latencyMode, message: "HLS playback failed" });
        });

        cleanup = () => {
          hls.destroy();
        };
      })
      .catch(() => {
        if (!disposed) {
          dispatch({ type: "error", mode: "hlsjs", latencyMode, message: "HLS playback failed" });
        }
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [hlsUrl, latencyMode]);

  return { ...snapshot, videoRef };
}

function hlsReducer(
  state: HLSFallbackSnapshot,
  action: HlsAction,
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

function hlsConfigForLatencyMode(latencyMode: HLSLatencyMode): Record<string, unknown> {
  if (latencyMode === "low-latency") {
    return {
      lowLatencyMode: true,
      backBufferLength: 10,
      liveSyncDurationCount: 2,
      maxLiveSyncPlaybackRate: 1.5,
      capLevelToPlayerSize: true,
    };
  }

  return {
    lowLatencyMode: false,
    backBufferLength: 30,
    liveSyncDurationCount: 4,
    maxLiveSyncPlaybackRate: 1.2,
    capLevelToPlayerSize: true,
  };
}

async function loadHlsConstructor(): Promise<HlsConstructor> {
  const module = await import("hls.js/light");
  return module.default;
}

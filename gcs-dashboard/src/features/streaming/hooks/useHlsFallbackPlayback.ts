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
const PLAYBACK_TOKEN_QUERY_KEY = "playbackToken";

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

        const hls = new Hls(hlsConfigForLatencyMode(latencyMode, hlsUrl));

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

function hlsConfigForLatencyMode(latencyMode: HLSLatencyMode, hlsUrl: string): Record<string, unknown> {
  const authenticatedRequestConfig = {
    xhrSetup: (xhr: XMLHttpRequest, url: string) => {
      const authenticatedUrl = appendHlsPlaybackQuery(url, hlsUrl);
      if (authenticatedUrl !== url) {
        xhr.open("GET", authenticatedUrl, true);
      }
    },
  };

  if (latencyMode === "low-latency") {
    return {
      lowLatencyMode: true,
      backBufferLength: 10,
      liveSyncDurationCount: 2,
      maxLiveSyncPlaybackRate: 1.5,
      capLevelToPlayerSize: true,
      ...authenticatedRequestConfig,
    };
  }

  return {
    lowLatencyMode: false,
    backBufferLength: 30,
    liveSyncDurationCount: 4,
    maxLiveSyncPlaybackRate: 1.2,
    capLevelToPlayerSize: true,
    ...authenticatedRequestConfig,
  };
}

export function appendHlsPlaybackQuery(requestUrl: string, hlsUrl: string): string {
  try {
    const source = new URL(hlsUrl, window.location.href);
    const token = source.searchParams.get(PLAYBACK_TOKEN_QUERY_KEY);
    if (!token) {
      return requestUrl;
    }

    const request = new URL(requestUrl, source.href);
    if (request.searchParams.has(PLAYBACK_TOKEN_QUERY_KEY)) {
      return requestUrl;
    }
    request.searchParams.set(PLAYBACK_TOKEN_QUERY_KEY, token);
    return request.toString();
  } catch {
    return requestUrl;
  }
}

async function loadHlsConstructor(): Promise<HlsConstructor> {
  const module = await import("hls.js/light");
  return module.default;
}

import { useEffect, useReducer, useRef } from "react";
import type { RefObject } from "react";

import type { HLSFallbackSnapshot, HLSPlaybackMode } from "../types";

type HlsConstructor = typeof import("hls.js").default;

interface UseHlsFallbackPlaybackOptions {
  hlsUrl: string | null;
}

type HlsAction =
  | { type: "loading"; mode: HLSPlaybackMode }
  | { type: "playing"; mode: HLSPlaybackMode }
  | { type: "error"; mode: HLSPlaybackMode; message: string };

const initialHlsState: HLSFallbackSnapshot = {
  status: "idle",
  mode: "unsupported",
  errorMessage: null,
};

export function useHlsFallbackPlayback({
  hlsUrl,
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
      dispatch({ type: "error", mode: "unsupported", message: "HLS URL is required" });
      return undefined;
    }

    let disposed = false;
    let cleanup: (() => void) | undefined;

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      const onLoadedMetadata = () => {
        void video.play();
        dispatch({ type: "playing", mode: "native" });
      };

      dispatch({ type: "loading", mode: "native" });
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
            message: "HLS playback is not supported in this browser",
          });
          return;
        }

        const hls = new Hls({
          lowLatencyMode: true,
          backBufferLength: 30,
        });

        dispatch({ type: "loading", mode: "hlsjs" });
        hls.loadSource(hlsUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          void video.play();
          dispatch({ type: "playing", mode: "hlsjs" });
        });
        hls.on(Hls.Events.ERROR, () => {
          dispatch({ type: "error", mode: "hlsjs", message: "HLS playback failed" });
        });

        cleanup = () => {
          hls.destroy();
        };
      })
      .catch(() => {
        if (!disposed) {
          dispatch({ type: "error", mode: "hlsjs", message: "HLS playback failed" });
        }
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [hlsUrl]);

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
        errorMessage: null,
      };
    case "playing":
      return {
        status: "playing",
        mode: action.mode,
        errorMessage: null,
      };
    case "error":
      return {
        status: "error",
        mode: action.mode,
        errorMessage: action.message,
      };
  }

  return state;
}

async function loadHlsConstructor(): Promise<HlsConstructor> {
  const module = await import("hls.js/light");
  return module.default;
}

import { useEffect, useReducer, useRef } from "react";
import type { RefObject } from "react";

import type { HLSFallbackSnapshot, HLSLatencyMode } from "@streaming/types";
import { hlsConfigForLatencyMode } from "./hlsPlaybackConfig";
import { hlsPlaybackReducer, initialHlsPlaybackState } from "./hlsPlaybackReducer";

type HlsConstructor = typeof import("hls.js").default;

interface UseHlsFallbackPlaybackOptions {
  hlsUrl: string | null;
  latencyMode?: HLSLatencyMode;
}

export function useHlsFallbackPlayback({
  hlsUrl,
  latencyMode = "stable",
}: UseHlsFallbackPlaybackOptions): HLSFallbackSnapshot & {
  videoRef: RefObject<HTMLVideoElement | null>;
} {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [snapshot, dispatch] = useReducer(hlsPlaybackReducer, initialHlsPlaybackState);

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

async function loadHlsConstructor(): Promise<HlsConstructor> {
  const module = await import("hls.js/light");
  return module.default;
}

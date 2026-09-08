import { useEffect, useReducer, useRef } from "react";
import type { Dispatch, RefObject } from "react";

import type { HLSFallbackSnapshot, HLSLatencyMode } from "@streaming/types";
import { hlsConfigForLatencyMode } from "@streaming/hooks/playback/hlsPlaybackConfig";
import { hlsPlaybackReducer, initialHlsPlaybackState, type HlsPlaybackAction } from "@streaming/hooks/playback/hlsPlaybackReducer";

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

  useEffect(() => startHlsPlayback(videoRef.current, hlsUrl, latencyMode, dispatch), [hlsUrl, latencyMode]);
  return { ...snapshot, videoRef };
}

function startHlsPlayback(
  video: HTMLVideoElement | null,
  hlsUrl: string | null,
  latencyMode: HLSLatencyMode,
  dispatch: Dispatch<HlsPlaybackAction>,
): (() => void) | undefined {
  if (!video) return undefined;
  if (!hlsUrl) {
    dispatch({ type: "error", mode: "unsupported", latencyMode, message: "HLS URL is required" });
    return undefined;
  }
  if (video.canPlayType("application/vnd.apple.mpegurl")) return startNativeHls(video, hlsUrl, latencyMode, dispatch);
  return startHlsJs(video, hlsUrl, latencyMode, dispatch);
}

function startNativeHls(video: HTMLVideoElement, hlsUrl: string, latencyMode: HLSLatencyMode,
  dispatch: Dispatch<HlsPlaybackAction>): () => void {
  const onLoadedMetadata = () => {
    void video.play();
    dispatch({ type: "playing", mode: "native", latencyMode });
  };
  dispatch({ type: "loading", mode: "native", latencyMode });
  video.src = hlsUrl;
  video.addEventListener("loadedmetadata", onLoadedMetadata);
  return () => { video.removeEventListener("loadedmetadata", onLoadedMetadata); video.removeAttribute("src"); };
}

function startHlsJs(video: HTMLVideoElement, hlsUrl: string, latencyMode: HLSLatencyMode,
  dispatch: Dispatch<HlsPlaybackAction>): () => void {
    let disposed = false;
    let cleanup: (() => void) | undefined;
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

    return () => { disposed = true; cleanup?.(); };
}

async function loadHlsConstructor(): Promise<HlsConstructor> {
  const module = await import("hls.js/light");
  return module.default;
}

import { useEffect, useMemo } from "react";

import { useHlsFallbackPlayback } from "@streaming/hooks/playback/useHlsFallbackPlayback";
import type { HLSFallbackPlayerProps } from "@streaming/types";
import { detectWebCodecsCapability } from "@streaming/webCodecsSupport";
import "./HLSFallbackPlayer.css";

const statusLabel = {
  idle: "idle",
  loading: "loading",
  playing: "playing",
  error: "error",
} as const;

const latencyModeLabel = {
  "low-latency": "저지연 HLS",
  stable: "안정 HLS",
} as const;

export function HLSFallbackPlayer({
  hlsUrl,
  streamId,
  title = "HLS fallback stream",
  fallbackReason = "WebRTC failed. Playing HLS fallback.",
  autoPlay = true,
  muted = true,
  controls = true,
  preload = "none",
  latencyMode = "stable",
  poster,
  className,
  onStatusChange,
}: HLSFallbackPlayerProps) {
  const playback = useHlsFallbackPlayback({ hlsUrl, latencyMode });
  const { videoRef, status, mode, errorMessage, latencyMode: activeLatencyMode } = playback;
  const webCodecs = useMemo(() => detectWebCodecsCapability(), []);

  useEffect(() => {
    onStatusChange?.({
      status,
      mode,
      latencyMode: activeLatencyMode,
      errorMessage,
      webCodecs: {
        supported: webCodecs.supported,
        reason: webCodecs.reason,
      },
    });
  }, [activeLatencyMode, errorMessage, mode, onStatusChange, status, webCodecs.reason, webCodecs.supported]);

  return (
    <figure
      className={["hls-fallback-player", className].filter(Boolean).join(" ")}
      data-latency-mode={activeLatencyMode}
      data-webcodecs={webCodecs.supported ? "ready" : "fallback"}
    >
      <video
        ref={videoRef}
        aria-label={title}
        autoPlay={autoPlay}
        muted={muted}
        playsInline
        controls={controls}
        preload={preload}
        poster={poster}
        className="hls-fallback-player__video"
      />
      <figcaption className="hls-fallback-player__overlay">
        <span
          className={`hls-fallback-player__status hls-fallback-player__status--${status}`}
          role="status"
          aria-live="polite"
        >
          fallback {statusLabel[status]}
        </span>
        <span className="hls-fallback-player__reason">{fallbackReason}</span>
        {streamId ? <span className="hls-fallback-player__stream">{streamId}</span> : null}
        <span className="hls-fallback-player__mode">mode: {mode}</span>
        <span className="hls-fallback-player__latency">{latencyModeLabel[activeLatencyMode]}</span>
        <span className="hls-fallback-player__webcodecs">
          WebCodecs: {webCodecs.supported ? "ready" : "fallback"}
        </span>
        {errorMessage ? <span className="hls-fallback-player__error">{errorMessage}</span> : null}
      </figcaption>
    </figure>
  );
}

export default HLSFallbackPlayer;

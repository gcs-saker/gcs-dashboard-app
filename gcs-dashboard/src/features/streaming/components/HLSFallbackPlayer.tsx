import { useEffect } from "react";

import { useHlsFallbackPlayback } from "../hooks/useHlsFallbackPlayback";
import type { HLSFallbackPlayerProps } from "../types";
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

  useEffect(() => {
    onStatusChange?.({ status, mode, latencyMode: activeLatencyMode, errorMessage });
  }, [activeLatencyMode, errorMessage, mode, onStatusChange, status]);

  return (
    <figure
      className={["hls-fallback-player", className].filter(Boolean).join(" ")}
      data-latency-mode={activeLatencyMode}
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
        {errorMessage ? <span className="hls-fallback-player__error">{errorMessage}</span> : null}
      </figcaption>
    </figure>
  );
}

export default HLSFallbackPlayer;

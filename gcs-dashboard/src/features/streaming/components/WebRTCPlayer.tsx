import { useEffect } from "react";

import { useWhepPlayback } from "../hooks/useWhepPlayback";
import type { WebRTCPlayerProps } from "../types";
import "./WebRTCPlayer.css";

const statusLabel = {
  idle: "idle",
  loading: "loading",
  playing: "playing",
  error: "error",
  offline: "offline",
} as const;

export function WebRTCPlayer({
  whepUrl,
  streamId,
  title = "WebRTC stream",
  isOnline = true,
  autoPlay = true,
  muted = true,
  controls = false,
  className,
  onStatusChange,
}: WebRTCPlayerProps) {
  const playback = useWhepPlayback({ whepUrl, isOnline });
  const { videoRef, status, connectionState, iceConnectionState, errorMessage } = playback;

  useEffect(() => {
    onStatusChange?.({
      status,
      connectionState,
      iceConnectionState,
      errorMessage,
    });
  }, [connectionState, errorMessage, iceConnectionState, onStatusChange, status]);

  return (
    <figure className={["webrtc-player", className].filter(Boolean).join(" ")}>
      <video
        ref={videoRef}
        aria-label={title}
        autoPlay={autoPlay}
        muted={muted}
        playsInline
        controls={controls}
        className="webrtc-player__video"
      />
      <figcaption className="webrtc-player__overlay">
        <span
          className={`webrtc-player__status webrtc-player__status--${status}`}
          role="status"
          aria-live="polite"
        >
          {statusLabel[status]}
        </span>
        {streamId ? <span className="webrtc-player__stream">{streamId}</span> : null}
        <span className="webrtc-player__state">pc: {connectionState}</span>
        <span className="webrtc-player__state">ice: {iceConnectionState}</span>
        {errorMessage ? <span className="webrtc-player__error">{errorMessage}</span> : null}
      </figcaption>
    </figure>
  );
}

export default WebRTCPlayer;

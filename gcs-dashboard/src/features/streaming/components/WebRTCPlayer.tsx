import { useEffect, useRef } from "react";

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
  muted = false,
  controls = true,
  className,
  onStatusChange,
}: WebRTCPlayerProps) {
  const onStatusChangeRef = useRef(onStatusChange);
  const playback = useWhepPlayback({ whepUrl, isOnline });
  const {
    videoRef,
    status,
    connectionState,
    iceConnectionState,
    errorMessage,
    hasVideoFrame,
    hasAudioTrack,
    isAudioActive,
    firstFrameLatencyMs,
    signalingTimings,
    audioStats,
  } = playback;

  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  useEffect(() => {
    onStatusChangeRef.current?.({
      status,
      connectionState,
      iceConnectionState,
      errorMessage,
      hasVideoFrame,
      hasAudioTrack,
      isAudioActive,
      firstFrameLatencyMs,
      signalingTimings,
      audioStats,
    });
  }, [
    audioStats,
    connectionState,
    errorMessage,
    firstFrameLatencyMs,
    hasAudioTrack,
    hasVideoFrame,
    iceConnectionState,
    isAudioActive,
    signalingTimings,
    status,
  ]);

  return (
    <figure
      className={["webrtc-player", className].filter(Boolean).join(" ")}
      data-testid="webrtc-player"
      data-playback-status={status}
      data-has-video-frame={hasVideoFrame ? "true" : "false"}
      data-has-audio-track={hasAudioTrack ? "true" : "false"}
      data-audio-active={isAudioActive ? "true" : "false"}
      data-audio-level={audioStats.audioLevel ?? ""}
      data-first-frame-latency-ms={firstFrameLatencyMs ?? ""}
      data-whep-response-ms={signalingTimings.whepResponseMs ?? ""}
      data-ice-gathering-done-ms={signalingTimings.iceGatheringDoneMs ?? ""}
      data-audio-jitter-ms={audioStats.jitterMs ?? ""}
      data-audio-jitter-buffer-delay-ms={audioStats.jitterBufferDelayMs ?? ""}
      data-audio-packets-lost={audioStats.packetsLost ?? ""}
      data-audio-packets-received={audioStats.packetsReceived ?? ""}
      data-ice-round-trip-time-ms={audioStats.roundTripTimeMs ?? ""}
      data-ice-candidate-type={audioStats.localCandidateType ?? ""}
      data-remote-ice-candidate-type={audioStats.remoteCandidateType ?? ""}
      data-ice-transport={audioStats.transportProtocol ?? ""}
      data-relay-fallback-reason={audioStats.relayFallbackReason ?? ""}
    >
      <video
        ref={videoRef}
        data-testid="webrtc-video"
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
        {firstFrameLatencyMs !== null ? (
          <span className="webrtc-player__state">first frame: {firstFrameLatencyMs}ms</span>
        ) : null}
        {signalingTimings.whepResponseMs !== null ? (
          <span className="webrtc-player__state">whep: {signalingTimings.whepResponseMs}ms</span>
        ) : null}
        {hasAudioTrack ? (
          <span className={`webrtc-player__audio ${isAudioActive ? "is-active" : ""}`}>
            {isAudioActive ? "audio" : "audio idle"}
          </span>
        ) : null}
        {errorMessage ? <span className="webrtc-player__error">{errorMessage}</span> : null}
      </figcaption>
    </figure>
  );
}

export default WebRTCPlayer;

import type { RefObject } from "react";

import {
  audioDiagnosticLabel,
  WEBRTC_STATUS_LABELS,
} from "@streaming/presentation/webrtcPlayerPresentation";
import type { WebRTCPlaybackSnapshot } from "@streaming/types";

interface WebRTCPlayerFigureProps extends WebRTCPlaybackSnapshot {
  autoPlay: boolean;
  muted: boolean;
  controls: boolean;
  showDiagnostics: boolean;
  className?: string;
  streamId?: string;
  title: string;
  videoRef: RefObject<HTMLVideoElement | null>;
}

export function WebRTCPlayerFigure({
  autoPlay,
  muted,
  controls,
  showDiagnostics,
  className,
  streamId,
  title,
  videoRef,
  status,
  connectionState,
  iceConnectionState,
  errorMessage,
  hasVideoFrame,
  hasAudioTrack,
  isAudioActive,
  audioPlaybackState,
  audioDiagnosticMessage,
  firstFrameLatencyMs,
  signalingTimings,
  audioStats,
  iceCandidateStats,
}: WebRTCPlayerFigureProps) {
  return (
    <figure
      className={["webrtc-player", className].filter(Boolean).join(" ")}
      data-testid="webrtc-player"
      data-playback-status={status}
      data-has-video-frame={hasVideoFrame ? "true" : "false"}
      data-has-audio-track={hasAudioTrack ? "true" : "false"}
      data-audio-active={isAudioActive ? "true" : "false"}
      data-audio-playback-state={audioPlaybackState}
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
      data-ice-candidate-total={iceCandidateStats?.total ?? 0}
      data-ice-candidate-host={iceCandidateStats?.host ?? 0}
      data-ice-candidate-srflx={iceCandidateStats?.srflx ?? 0}
      data-ice-candidate-relay={iceCandidateStats?.relay ?? 0}
      data-ice-candidate-udp={iceCandidateStats?.udp ?? 0}
      data-ice-candidate-tcp={iceCandidateStats?.tcp ?? 0}
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
      {showDiagnostics ? <figcaption className="webrtc-player__overlay">
        <span
          className={`webrtc-player__status webrtc-player__status--${status}`}
          role="status"
          aria-live="polite"
        >
          {WEBRTC_STATUS_LABELS[status]}
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
        <span
          className={`webrtc-player__audio webrtc-player__audio--${audioPlaybackState} ${isAudioActive ? "is-active" : ""}`}
          title={audioDiagnosticMessage}
        >
          {audioDiagnosticLabel(audioPlaybackState)}
        </span>
        {errorMessage ? <span className="webrtc-player__error">{errorMessage}</span> : null}
      </figcaption> : null}
    </figure>
  );
}

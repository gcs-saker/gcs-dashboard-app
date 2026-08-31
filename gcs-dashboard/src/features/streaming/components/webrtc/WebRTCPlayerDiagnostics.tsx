import { audioDiagnosticLabel, WEBRTC_STATUS_LABELS } from "@streaming/presentation/webrtcPlayerPresentation";
import type { WebRTCPlaybackSnapshot } from "@streaming/types";

interface WebRTCPlayerDiagnosticsProps {
  snapshot: WebRTCPlaybackSnapshot;
}

export function WebRTCPlayerDiagnostics({ snapshot }: WebRTCPlayerDiagnosticsProps) {
  const {
    audioDiagnosticMessage,
    audioPlaybackState,
    connectionState,
    errorMessage,
    firstFrameLatencyMs,
    iceConnectionState,
    isAudioActive,
    signalingTimings,
    status,
  } = snapshot;
  return (
    <figcaption className="webrtc-player__overlay">
      <span className={`webrtc-player__status webrtc-player__status--${status}`} role="status" aria-live="polite">
        {WEBRTC_STATUS_LABELS[status]}
      </span>
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
    </figcaption>
  );
}

import { useEffect, useRef } from "react";

import { WebRTCPlayerFigure } from "./webrtc/WebRTCPlayerFigure";
import { useWhepPlayback } from "@streaming/hooks/playback/useWhepPlayback";
import { EMPTY_ICE_CANDIDATE_STATS } from "@streaming/webrtcPlayerPresentation";
import type { WebRTCPlayerProps } from "@streaming/types";
import "./WebRTCPlayer.css";

export const WEBRTC_PLAYER_EVIDENCE_ATTRIBUTES = [
  "data-first-frame-latency-ms",
  "data-has-video-frame",
  "data-audio-level",
] as const;

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
    audioPlaybackState,
    audioDiagnosticMessage,
    firstFrameLatencyMs,
    signalingTimings,
    audioStats,
    iceCandidateStats = EMPTY_ICE_CANDIDATE_STATS,
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
      audioPlaybackState,
      audioDiagnosticMessage,
      firstFrameLatencyMs,
      signalingTimings,
      audioStats,
      iceCandidateStats,
    });
  }, [
    audioStats,
    audioDiagnosticMessage,
    audioPlaybackState,
    connectionState,
    errorMessage,
    firstFrameLatencyMs,
    hasAudioTrack,
    hasVideoFrame,
    iceConnectionState,
    iceCandidateStats,
    isAudioActive,
    signalingTimings,
    status,
  ]);

  return (
    <WebRTCPlayerFigure
      audioDiagnosticMessage={audioDiagnosticMessage}
      audioPlaybackState={audioPlaybackState}
      audioStats={audioStats}
      autoPlay={autoPlay}
      className={className}
      connectionState={connectionState}
      controls={controls}
      errorMessage={errorMessage}
      firstFrameLatencyMs={firstFrameLatencyMs}
      hasAudioTrack={hasAudioTrack}
      hasVideoFrame={hasVideoFrame}
      iceCandidateStats={iceCandidateStats}
      iceConnectionState={iceConnectionState}
      isAudioActive={isAudioActive}
      muted={muted}
      signalingTimings={signalingTimings}
      status={status}
      streamId={streamId}
      title={title}
      videoRef={videoRef}
    />
  );
}

export default WebRTCPlayer;

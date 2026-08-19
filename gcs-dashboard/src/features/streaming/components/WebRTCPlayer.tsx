import { useEffect, useRef } from "react";

import { WebRTCPlayerFigure } from "./webrtc/WebRTCPlayerFigure";
import { useWhepPlayback } from "@streaming/hooks/playback/useWhepPlayback";
import { EMPTY_ICE_CANDIDATE_STATS } from "@streaming/presentation/webrtcPlayerPresentation";
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
  showDiagnostics = true,
  className,
  onStatusChange,
}: WebRTCPlayerProps) {
  const playback = useWhepPlayback({ whepUrl, isOnline });
  useWebRTCStatusNotification(playback, onStatusChange);
  return <WebRTCPlayerFigure {...playback} audioStats={playback.audioStats} autoPlay={autoPlay}
    className={className} controls={controls} showDiagnostics={showDiagnostics}
    iceCandidateStats={playback.iceCandidateStats ?? EMPTY_ICE_CANDIDATE_STATS}
    muted={muted} streamId={streamId} title={title} videoRef={playback.videoRef} />;
}

function useWebRTCStatusNotification(
  playback: ReturnType<typeof useWhepPlayback>,
  onStatusChange: WebRTCPlayerProps["onStatusChange"],
): void {
  const onStatusChangeRef = useRef(onStatusChange);
  const { audioDiagnosticMessage, audioPlaybackState, audioStats, connectionState, errorMessage,
    firstFrameLatencyMs, hasAudioTrack, hasVideoFrame, iceCandidateStats = EMPTY_ICE_CANDIDATE_STATS,
    iceConnectionState, isAudioActive, signalingTimings, status } = playback;
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

}

export default WebRTCPlayer;

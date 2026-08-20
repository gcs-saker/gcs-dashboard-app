import { useEffect } from "react";

import { useRealtimePlayback } from "@streaming/hooks/playback/useRealtimePlayback";
import type { RealtimePlayerProps, RealtimePlayerSnapshot, WebRTCPlaybackSnapshot } from "@streaming/types";
import {
  describeWebRTCFailure,
  isRecoverableWebRTCFailure,
  shouldSkipWebRTCRetryAfterRelayFailure,
} from "@streaming/runtime/streamReconnectPolicy";
import { buildWebRTCRuntimeEvidence } from "@streaming/runtime/webrtcRuntimeEvidence";
import { HLSFallbackPlayer } from "./HLSFallbackPlayer";
import "./RealtimePlayer.css";
import { RealtimePlayerPlaceholder } from "./realtime/RealtimePlayerPlaceholder";
import { WebRTCPlayer } from "./WebRTCPlayer";

export function RealtimePlayer({
  streamId,
  title = "Realtime stream",
  className,
  muted = false,
  controls = true,
  showDiagnostics = false,
  fetcher,
  reconnectDelaysMs,
  playbackReadyRetryDelaysMs,
  onStatusChange,
}: RealtimePlayerProps) {
  const playback = useRealtimePlayback({ streamId, fetcher, reconnectDelaysMs, playbackReadyRetryDelaysMs });
  const {
    mode,
    streamStatus,
    errorMessage,
    playback: playbackResponse,
    webrtcRetryAttempt,
  } = playback;
  const playbackUrls = playbackResponse?.playbackUrls;
  const isOnline = streamStatus === "online" || streamStatus === "registered" || streamStatus === "unknown";

  useEffect(() => {
    onStatusChange?.({
      mode,
      streamStatus,
      errorMessage,
      webrtcRetryAttempt,
    });
  }, [errorMessage, mode, onStatusChange, streamStatus, webrtcRetryAttempt]);

  return <RealtimePlayerContent {...{ className, controls, isOnline, muted, onStatusChange, playback,
    playbackUrls, showDiagnostics, streamId, title }} />;
}

interface RealtimePlayerContentProps {
  className?: string;
  controls: boolean;
  isOnline: boolean;
  muted: boolean;
  onStatusChange?: (snapshot: RealtimePlayerSnapshot) => void;
  playback: ReturnType<typeof useRealtimePlayback>;
  playbackUrls: NonNullable<ReturnType<typeof useRealtimePlayback>["playback"]>["playbackUrls"] | undefined;
  showDiagnostics: boolean;
  streamId: string;
  title: string;
}

function RealtimePlayerContent(props: RealtimePlayerContentProps) {
  const { playback } = props;
  const { errorMessage, fallbackReason, mode, reconnectDelayMs, streamStatus, webrtcRetryAttempt } = playback;
  return (
    <section className={["realtime-player", props.className].filter(Boolean).join(" ")} aria-label={props.title}>
      {props.showDiagnostics ? <header className="realtime-player__header">
        <span className={`realtime-player__badge realtime-player__badge--${streamStatus}`}>
          {streamStatus}
        </span>
        <span className="realtime-player__latency">저지연</span>
        <span className="realtime-player__mode">mode: {mode}</span>
      </header> : null}

      {mode === "loading" ? <RealtimePlayerPlaceholder mode="loading" /> : null}

      {mode === "webrtc" ? (
        <WebRTCPlayer
          key={`${props.streamId}-${webrtcRetryAttempt}`} whepUrl={props.playbackUrls?.webrtc ?? null}
          streamId={props.streamId} title={`${props.title} WebRTC`} isOnline={props.isOnline}
          muted={props.muted} controls={props.controls} showDiagnostics={props.showDiagnostics}
          onStatusChange={(snapshot) => handleWebRTCStatus(playback, snapshot, props.onStatusChange)}
        />
      ) : null}

      {mode === "reconnecting" ? <RealtimePlayerPlaceholder mode="reconnecting" reconnectDelayMs={reconnectDelayMs} /> : null}

      {mode === "hls" ? (
        <HLSFallbackPlayer
          hlsUrl={props.playbackUrls?.hls ?? null}
          streamId={props.streamId}
          title={`${props.title} HLS fallback`}
          fallbackReason={fallbackReason}
          latencyMode="stable"
          muted={props.muted}
          controls={props.controls}
          showDiagnostics={props.showDiagnostics}
        />
      ) : null}

      {mode === "offline" ? <RealtimePlayerPlaceholder mode="offline" /> : null}

      {mode === "error" ? <RealtimePlayerPlaceholder errorMessage={errorMessage} mode="error" /> : null}
    </section>
  );
}

function handleWebRTCStatus(
  playback: ReturnType<typeof useRealtimePlayback>,
  snapshot: WebRTCPlaybackSnapshot,
  notify?: (snapshot: RealtimePlayerSnapshot) => void,
): void {
  const evidence = buildWebRTCRuntimeEvidence(snapshot);
  notify?.({ mode: playback.mode, streamStatus: playback.streamStatus, errorMessage: playback.errorMessage,
    webrtcRetryAttempt: playback.webrtcRetryAttempt, webrtcIcePath: evidence.icePath,
    webrtcSignalingComplete: evidence.signalingComplete, hasAudioTrack: snapshot.hasAudioTrack,
    isAudioActive: snapshot.isAudioActive, audioPlaybackState: snapshot.audioPlaybackState,
    audioDiagnosticMessage: snapshot.audioDiagnosticMessage, audioLevel: snapshot.audioStats.audioLevel,
    webrtcFirstFrameLatencyMs: snapshot.firstFrameLatencyMs,
    webrtcWhepResponseMs: snapshot.signalingTimings.whepResponseMs, audioJitterMs: snapshot.audioStats.jitterMs,
    audioPacketsLost: snapshot.audioStats.packetsLost, iceRoundTripTimeMs: snapshot.audioStats.roundTripTimeMs,
    localCandidateType: snapshot.audioStats.localCandidateType, remoteCandidateType: snapshot.audioStats.remoteCandidateType,
    iceTransportProtocol: snapshot.audioStats.transportProtocol, relayFallbackReason: snapshot.audioStats.relayFallbackReason,
    iceCandidateTotal: snapshot.iceCandidateStats?.total, iceCandidateRelay: snapshot.iceCandidateStats?.relay,
    iceCandidateSrflx: snapshot.iceCandidateStats?.srflx });
  if (snapshot.status === "playing") return playback.useWebRTC();
  if (!isRecoverableWebRTCFailure(snapshot)) return;
  const reason = describeWebRTCFailure(snapshot);
  if (shouldSkipWebRTCRetryAfterRelayFailure(snapshot)) return playback.useHLSFallback(reason);
  playback.scheduleWebRTCRetry(reason);
}

export default RealtimePlayer;

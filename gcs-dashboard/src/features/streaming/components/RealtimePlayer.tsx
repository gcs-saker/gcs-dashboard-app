import { useEffect } from "react";

import { useRealtimePlayback } from "@streaming/hooks/playback/useRealtimePlayback";
import type { RealtimePlayerProps } from "@streaming/types";
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
    fallbackReason,
    reconnectDelayMs,
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

  return (
    <section className={["realtime-player", className].filter(Boolean).join(" ")} aria-label={title}>
      {showDiagnostics ? <header className="realtime-player__header">
        <span className={`realtime-player__badge realtime-player__badge--${streamStatus}`}>
          {streamStatus}
        </span>
        <span className="realtime-player__latency">저지연</span>
        <span className="realtime-player__stream">{streamId}</span>
        <span className="realtime-player__mode">mode: {mode}</span>
      </header> : null}

      {mode === "loading" ? <RealtimePlayerPlaceholder mode="loading" /> : null}

      {mode === "webrtc" ? (
        <WebRTCPlayer
          key={`${streamId}-${webrtcRetryAttempt}`}
          whepUrl={playbackUrls?.webrtc ?? null}
          streamId={streamId}
          title={`${title} WebRTC`}
          isOnline={isOnline}
          muted={muted}
          controls={controls}
          showDiagnostics={showDiagnostics}
          onStatusChange={(snapshot) => {
            const evidence = buildWebRTCRuntimeEvidence(snapshot);
            onStatusChange?.({
              mode,
              streamStatus,
              errorMessage,
              webrtcRetryAttempt,
              webrtcIcePath: evidence.icePath,
              webrtcSignalingComplete: evidence.signalingComplete,
              hasAudioTrack: snapshot.hasAudioTrack,
              isAudioActive: snapshot.isAudioActive,
              audioPlaybackState: snapshot.audioPlaybackState,
              audioDiagnosticMessage: snapshot.audioDiagnosticMessage,
              audioLevel: snapshot.audioStats.audioLevel,
              webrtcFirstFrameLatencyMs: snapshot.firstFrameLatencyMs,
              webrtcWhepResponseMs: snapshot.signalingTimings.whepResponseMs,
              audioJitterMs: snapshot.audioStats.jitterMs,
              audioPacketsLost: snapshot.audioStats.packetsLost,
              iceRoundTripTimeMs: snapshot.audioStats.roundTripTimeMs,
              localCandidateType: snapshot.audioStats.localCandidateType,
              remoteCandidateType: snapshot.audioStats.remoteCandidateType,
              iceTransportProtocol: snapshot.audioStats.transportProtocol,
              relayFallbackReason: snapshot.audioStats.relayFallbackReason,
              iceCandidateTotal: snapshot.iceCandidateStats?.total,
              iceCandidateRelay: snapshot.iceCandidateStats?.relay,
              iceCandidateSrflx: snapshot.iceCandidateStats?.srflx,
            });

            if (snapshot.status === "playing") {
              playback.useWebRTC();
              return;
            }

            if (isRecoverableWebRTCFailure(snapshot)) {
              const reason = describeWebRTCFailure(snapshot);
              if (shouldSkipWebRTCRetryAfterRelayFailure(snapshot)) {
                playback.useHLSFallback(reason);
                return;
              }
              playback.scheduleWebRTCRetry(reason);
            }
          }}
        />
      ) : null}

      {mode === "reconnecting" ? <RealtimePlayerPlaceholder mode="reconnecting" reconnectDelayMs={reconnectDelayMs} /> : null}

      {mode === "hls" ? (
        <HLSFallbackPlayer
          hlsUrl={playbackUrls?.hls ?? null}
          streamId={streamId}
          title={`${title} HLS fallback`}
          fallbackReason={fallbackReason}
          latencyMode="stable"
          muted={muted}
          controls={controls}
          showDiagnostics={showDiagnostics}
        />
      ) : null}

      {mode === "offline" ? <RealtimePlayerPlaceholder mode="offline" /> : null}

      {mode === "error" ? <RealtimePlayerPlaceholder errorMessage={errorMessage} mode="error" /> : null}
    </section>
  );
}

export default RealtimePlayer;

import { useEffect } from "react";

import { useRealtimePlayback } from "../hooks/useRealtimePlayback";
import type { RealtimePlayerProps } from "../types";
import { describeWebRTCFailure, isRecoverableWebRTCFailure } from "../streamReconnectPolicy";
import { HLSFallbackPlayer } from "./HLSFallbackPlayer";
import "./RealtimePlayer.css";
import { WebRTCPlayer } from "./WebRTCPlayer";

export function RealtimePlayer({
  streamId,
  title = "Realtime stream",
  className,
  fetcher,
  reconnectDelaysMs,
  onStatusChange,
}: RealtimePlayerProps) {
  const playback = useRealtimePlayback({ streamId, fetcher, reconnectDelaysMs });
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
      <header className="realtime-player__header">
        <span className={`realtime-player__badge realtime-player__badge--${streamStatus}`}>
          {streamStatus}
        </span>
        <span className="realtime-player__latency">저지연</span>
        <span className="realtime-player__stream">{streamId}</span>
        <span className="realtime-player__mode">mode: {mode}</span>
      </header>

      {mode === "loading" ? (
        <div className="realtime-player__placeholder" role="status" aria-live="polite">
          loading playback
        </div>
      ) : null}

      {mode === "webrtc" ? (
          <WebRTCPlayer
          key={`${streamId}-${webrtcRetryAttempt}`}
          whepUrl={playbackUrls?.webrtc ?? null}
          streamId={streamId}
          title={`${title} WebRTC`}
          isOnline={isOnline}
          onStatusChange={(snapshot) => {
            onStatusChange?.({
              mode,
              streamStatus,
              errorMessage,
              webrtcRetryAttempt,
              hasAudioTrack: snapshot.hasAudioTrack,
              isAudioActive: snapshot.isAudioActive,
              webrtcFirstFrameLatencyMs: snapshot.firstFrameLatencyMs,
              webrtcWhepResponseMs: snapshot.signalingTimings.whepResponseMs,
              audioJitterMs: snapshot.audioStats.jitterMs,
              audioPacketsLost: snapshot.audioStats.packetsLost,
            });

            if (snapshot.status === "playing") {
              playback.useWebRTC();
              return;
            }

            if (isRecoverableWebRTCFailure(snapshot)) {
              playback.scheduleWebRTCRetry(describeWebRTCFailure(snapshot));
            }
          }}
        />
      ) : null}

      {mode === "reconnecting" ? (
        <div className="realtime-player__placeholder realtime-player__placeholder--reconnecting" role="status" aria-live="polite">
          스트림 재연결 중
          {reconnectDelayMs !== null ? ` (${reconnectDelayMs}ms)` : ""}
        </div>
      ) : null}

      {mode === "hls" ? (
        <HLSFallbackPlayer
          hlsUrl={playbackUrls?.hls ?? null}
          streamId={streamId}
          title={`${title} HLS fallback`}
          fallbackReason={fallbackReason}
          muted={false}
          controls
        />
      ) : null}

      {mode === "offline" ? (
        <div className="realtime-player__placeholder realtime-player__placeholder--offline" role="status">
          stream offline
        </div>
      ) : null}

      {mode === "error" ? (
        <div className="realtime-player__placeholder realtime-player__placeholder--error" role="alert">
          {errorMessage ?? "realtime playback failed"}
        </div>
      ) : null}
    </section>
  );
}

export default RealtimePlayer;

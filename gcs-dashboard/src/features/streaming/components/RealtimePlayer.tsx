import { useEffect } from "react";

import { useRealtimePlayback } from "../hooks/useRealtimePlayback";
import type { RealtimePlayerProps } from "../types";
import {
  describeWebRTCFailure,
  isRecoverableWebRTCFailure,
  shouldSkipWebRTCRetryAfterRelayFailure,
} from "../streamReconnectPolicy";
import { HLSFallbackPlayer } from "./HLSFallbackPlayer";
import "./RealtimePlayer.css";
import { WebRTCPlayer } from "./WebRTCPlayer";

export function RealtimePlayer({
  streamId,
  title = "Realtime stream",
  className,
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
          <span className="realtime-player__signal" aria-hidden="true" />
          <strong>스트림 신호 확인 중</strong>
          <span>WebRTC 경로와 송출 상태를 확인하고 있습니다.</span>
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
              audioLevel: snapshot.audioStats.audioLevel,
              webrtcFirstFrameLatencyMs: snapshot.firstFrameLatencyMs,
              webrtcWhepResponseMs: snapshot.signalingTimings.whepResponseMs,
              audioJitterMs: snapshot.audioStats.jitterMs,
              audioPacketsLost: snapshot.audioStats.packetsLost,
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

      {mode === "reconnecting" ? (
        <div className="realtime-player__placeholder realtime-player__placeholder--reconnecting" role="status" aria-live="polite">
          <span className="realtime-player__signal" aria-hidden="true" />
          <strong>스트림 재연결 중</strong>
          <span>{reconnectDelayMs !== null ? `${reconnectDelayMs}ms 후 다시 시도합니다.` : "미디어 경로를 다시 연결하고 있습니다."}</span>
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
          <span className="realtime-player__signal" aria-hidden="true" />
          <strong>송출 신호 없음</strong>
          <span>장비가 연결되면 자동으로 수신을 재개합니다.</span>
        </div>
      ) : null}

      {mode === "error" ? (
        <div className="realtime-player__placeholder realtime-player__placeholder--error" role="alert">
          <span className="realtime-player__signal" aria-hidden="true" />
          <strong>{playbackErrorTitle(errorMessage)}</strong>
          <span>{playbackErrorDescription(errorMessage)}</span>
          <span className="realtime-player__hint">주소 변경 또는 인증 서버 상태를 확인하세요.</span>
        </div>
      ) : null}
    </section>
  );
}

export default RealtimePlayer;

function playbackErrorTitle(errorMessage: string | null): string {
  if (errorMessage?.includes("authentication")) return "인증 서버 미연결";
  if (errorMessage?.includes("404")) return "스트림 경로 없음";
  if (errorMessage?.includes("502")) return "시그널링 경로 점검 필요";
  return "수신 경로 오류";
}

function playbackErrorDescription(errorMessage: string | null): string {
  if (errorMessage?.includes("authentication")) {
    return "현재 미리보기 환경에서 인증 API가 응답하지 않아 재생 권한을 확인하지 못했습니다.";
  }
  if (errorMessage?.includes("404")) return "송출 path가 아직 등록되지 않았거나 MediaMTX 경로와 일치하지 않습니다.";
  if (errorMessage?.includes("502")) return "Edge proxy에서 signaling upstream으로 연결하지 못했습니다.";
  return "실시간 재생 경로를 열 수 없습니다.";
}

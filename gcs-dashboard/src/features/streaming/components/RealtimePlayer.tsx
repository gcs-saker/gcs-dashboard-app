import { useEffect } from "react";

import { useRealtimePlayback } from "../hooks/useRealtimePlayback";
import type { RealtimePlayerProps } from "../types";
import { HLSFallbackPlayer } from "./HLSFallbackPlayer";
import "./RealtimePlayer.css";
import { WebRTCPlayer } from "./WebRTCPlayer";

export function RealtimePlayer({
  streamId,
  title = "Realtime stream",
  className,
  fetcher,
  onStatusChange,
}: RealtimePlayerProps) {
  const playback = useRealtimePlayback({ streamId, fetcher });
  const { mode, streamStatus, errorMessage, playback: playbackResponse, fallbackReason } = playback;
  const playbackUrls = playbackResponse?.playbackUrls;
  const isOnline = streamStatus === "online" || streamStatus === "registered" || streamStatus === "unknown";

  useEffect(() => {
    onStatusChange?.({
      mode,
      streamStatus,
      errorMessage,
    });
  }, [errorMessage, mode, onStatusChange, streamStatus]);

  return (
    <section className={["realtime-player", className].filter(Boolean).join(" ")} aria-label={title}>
      <header className="realtime-player__header">
        <span className={`realtime-player__badge realtime-player__badge--${streamStatus}`}>
          {streamStatus}
        </span>
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
          whepUrl={playbackUrls?.webrtc ?? null}
          streamId={streamId}
          title={`${title} WebRTC`}
          isOnline={isOnline}
          onStatusChange={(snapshot) => {
            if (snapshot.status === "playing") {
              playback.useWebRTC();
              return;
            }

            if (snapshot.status === "error") {
              playback.useHLSFallback(snapshot.errorMessage ?? "WebRTC failed. Playing HLS fallback.");
            }
          }}
        />
      ) : null}

      {mode === "hls" ? (
        <HLSFallbackPlayer
          hlsUrl={playbackUrls?.hls ?? null}
          streamId={streamId}
          title={`${title} HLS fallback`}
          fallbackReason={fallbackReason}
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

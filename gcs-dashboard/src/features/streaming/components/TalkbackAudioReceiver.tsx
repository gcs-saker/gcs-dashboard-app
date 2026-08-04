import { useEffect, useState } from "react";

import { useWhepPlayback } from "@streaming/hooks/useWhepPlayback";
import { fetchAuthorizedTalkbackPlayback } from "@streaming/publisher/publisherApi";

interface TalkbackAudioReceiverProps {
  streamId: string;
}

export function TalkbackAudioReceiver({ streamId }: TalkbackAudioReceiverProps) {
  const [enabled, setEnabled] = useState(false);
  const [whepUrl, setWhepUrl] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) {
      setWhepUrl(null);
      setSessionError(null);
      return;
    }
    let isCurrent = true;
    void fetchAuthorizedTalkbackPlayback(streamId, fetch)
      .then((url) => { if (isCurrent) setWhepUrl(url); })
      .catch((error: unknown) => {
        if (isCurrent) setSessionError(error instanceof Error ? error.message : "관제 음성 수신 인증 실패");
      });
    return () => { isCurrent = false; };
  }, [enabled, streamId]);
  const playback = useWhepPlayback({ whepUrl, isOnline: enabled });
  const errorMessage = sessionError ?? talkbackErrorMessage(playback.errorMessage);

  return (
    <section className="talkback-audio-receiver" aria-label="관제 음성 수신">
      <div className="talkback-audio-receiver__controls">
        <strong>관제 음성</strong>
        <button type="button" onClick={() => setEnabled((current) => !current)}>
          {enabled ? "수신 중지" : "수신 시작"}
        </button>
        <span aria-live="polite">{enabled ? talkbackStatusLabel(playback.status) : "idle"}</span>
        {enabled ? (
          <span
            className={`talkback-audio-receiver__audio talkback-audio-receiver__audio--${playback.audioPlaybackState ?? "no-track"}`}
            title={playback.audioDiagnosticMessage ?? "오디오 트랙 없음"}
          >
            {talkbackAudioLabel(playback.audioPlaybackState)}
          </span>
        ) : null}
      </div>
      {enabled ? (
        <>
          <video
            ref={playback.videoRef}
            className="talkback-audio-receiver__media"
            aria-label="관제 음성 WebRTC 수신"
            autoPlay
            controls
            playsInline
          />
          {errorMessage ? <span className="talkback-audio-receiver__error">{errorMessage}</span> : null}
        </>
      ) : null}
    </section>
  );
}

function talkbackAudioLabel(audioPlaybackState: string | undefined): string {
  if (audioPlaybackState === "receiving") return "오디오 수신";
  if (audioPlaybackState === "track-muted") return "무음 수신";
  if (audioPlaybackState === "playback-blocked") return "브라우저 차단";
  return "오디오 대기";
}

function talkbackStatusLabel(status: string): string {
  if (status === "loading") {
    return "관제 음성 대기";
  }
  return status;
}

function talkbackErrorMessage(message: string | null): string | null {
  if (!message) {
    return null;
  }
  if (message.includes("WHEP request failed with 404")) {
    return "관제 음성 송신이 아직 시작되지 않았습니다. 대시보드에서 마이크 송신을 먼저 시작하세요.";
  }
  return message;
}

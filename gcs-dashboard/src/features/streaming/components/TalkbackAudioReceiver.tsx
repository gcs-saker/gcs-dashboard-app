import { useMemo, useState } from "react";

import { useWhepPlayback } from "../hooks/useWhepPlayback";
import { talkbackWhepUrl } from "../talkbackRoutes";

interface TalkbackAudioReceiverProps {
  streamId: string;
}

export function TalkbackAudioReceiver({ streamId }: TalkbackAudioReceiverProps) {
  const [enabled, setEnabled] = useState(false);
  const whepUrl = useMemo(() => enabled ? talkbackWhepUrl(streamId) : null, [enabled, streamId]);
  const playback = useWhepPlayback({ whepUrl, isOnline: enabled });

  return (
    <section className="talkback-audio-receiver" aria-label="관제 음성 수신">
      <div className="talkback-audio-receiver__controls">
        <strong>관제 음성</strong>
        <button type="button" onClick={() => setEnabled((current) => !current)}>
          {enabled ? "수신 중지" : "수신 시작"}
        </button>
        <span aria-live="polite">{enabled ? playback.status : "idle"}</span>
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
          <span className="talkback-audio-receiver__url">{whepUrl}</span>
          {playback.errorMessage ? <span className="talkback-audio-receiver__error">{playback.errorMessage}</span> : null}
        </>
      ) : null}
    </section>
  );
}

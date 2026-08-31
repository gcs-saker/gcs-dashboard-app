import { playbackErrorDescription, playbackErrorTitle } from "@streaming/presentation/realtimePlayerPresentation";

type RealtimePlayerPlaceholderMode = "loading" | "reconnecting" | "offline" | "error";

interface RealtimePlayerPlaceholderProps {
  errorMessage?: string | null;
  mode: RealtimePlayerPlaceholderMode;
  reconnectDelayMs?: number | null;
}

const PLACEHOLDER_COPY = {
  loading: ["스트림 신호 확인 중", "WebRTC 경로와 송출 상태를 확인하고 있습니다."],
  offline: ["송출 신호 없음", "장비가 연결되면 자동으로 수신을 재개합니다."],
} as const;

export function RealtimePlayerPlaceholder({ errorMessage = null, mode, reconnectDelayMs = null }: RealtimePlayerPlaceholderProps) {
  if (mode === "error") {
    return (
      <div className="realtime-player__placeholder realtime-player__placeholder--error" role="alert">
        <span className="realtime-player__signal" aria-hidden="true" />
        <strong>{playbackErrorTitle(errorMessage)}</strong>
        <span>{playbackErrorDescription(errorMessage)}</span>
        <span className="realtime-player__hint">주소 변경 또는 인증 서버 상태를 확인하세요.</span>
      </div>
    );
  }
  const copy = mode === "reconnecting"
    ? ["스트림 재연결 중", reconnectDelayMs !== null ? `${reconnectDelayMs}ms 후 다시 시도합니다.` : "미디어 경로를 다시 연결하고 있습니다."]
    : PLACEHOLDER_COPY[mode];
  return (
    <div className={`realtime-player__placeholder realtime-player__placeholder--${mode}`} role="status" aria-live="polite">
      <span className="realtime-player__signal" aria-hidden="true" />
      <strong>{copy[0]}</strong>
      <span>{copy[1]}</span>
    </div>
  );
}

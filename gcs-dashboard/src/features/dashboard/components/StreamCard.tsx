import { memo, useCallback } from "react";
import { RealtimePlayer } from "@streaming/components/RealtimePlayer";
import { isReceivableStream } from "@dashboard/dashboardCctv";
import type { DashboardStreamSlot } from "@dashboard/streamTypes";
import {
  getDashboardStreamDisplayName,
  getDashboardStreamStatusClass,
  getDashboardStreamStatusText,
} from "@dashboard/streamTypes";

interface StreamCardProps {
  stream: DashboardStreamSlot;
  isSelected: boolean;
  hasAudioActivity?: boolean;
  isTalkbackTarget?: boolean;
  onSelect: (streamId: string) => void;
  onToggleTalkbackTarget?: (streamPath: string) => void;
}

export const StreamCard = memo(function StreamCard({
  stream,
  isSelected,
  hasAudioActivity = false,
  isTalkbackTarget = false,
  onSelect,
  onToggleTalkbackTarget,
}: StreamCardProps) {
  const canTalkback = Boolean(stream.streamPath);
  const selectStream = useCallback(() => onSelect(stream.id), [onSelect, stream.id]);
  const toggleTalkback = useCallback(() => {
    if (stream.streamPath) {
      onToggleTalkbackTarget?.(stream.streamPath);
    }
  }, [onToggleTalkbackTarget, stream.streamPath]);

  return (
    <article className={`stream-card ${isSelected ? "is-selected" : ""} ${hasAudioActivity ? "has-audio" : ""} ${isTalkbackTarget ? "is-talkback-target" : ""}`}>
      <button
        aria-label={`${stream.title} 선택`}
        aria-pressed={isSelected}
        className="stream-card__select"
        onClick={selectStream}
        type="button"
      >
        <span className="stream-card__topline">
          <strong>{stream.title}</strong>
          <span className={`ops-badge ${getDashboardStreamStatusClass(stream.status)}`}>
            {getDashboardStreamStatusText(stream.status)}
          </span>
          {hasAudioActivity ? <span className="stream-card__audio">음성</span> : null}
        </span>
      </button>
      <div className={`stream-card__visual mode-${stream.mode.toLowerCase()}`}>
        {isReceivableStream(stream) ? (
          <RealtimePlayer controls={false} muted streamId={stream.streamPath} title={`${stream.title} 미리보기`} />
        ) : (
          <>
            <span className="reticle" />
            <span className="stream-card__visual-status">
              상태: 스트림 선택 대기
            </span>
          </>
        )}
      </div>
      <span className="stream-card__detail">{getDashboardStreamDisplayName(stream)}</span>
      {isSelected ? <span className="stream-card__selected-link">현재 선택</span> : null}
      {onToggleTalkbackTarget ? (
        <button
          aria-pressed={isTalkbackTarget}
          className="stream-card__talkback"
          disabled={!canTalkback}
          onClick={toggleTalkback}
          type="button"
        >
          음성 송신 대상
        </button>
      ) : null}
    </article>
  );
}, areStreamCardPropsEqual);

function areStreamCardPropsEqual(previous: StreamCardProps, next: StreamCardProps): boolean {
  return (
    previous.stream.id === next.stream.id &&
    previous.stream.title === next.stream.title &&
    previous.stream.status === next.stream.status &&
    previous.stream.mode === next.stream.mode &&
    previous.stream.detail === next.stream.detail &&
    previous.stream.connectedDeviceId === next.stream.connectedDeviceId &&
    previous.stream.streamPath === next.stream.streamPath &&
    previous.stream.aiModeEnabled === next.stream.aiModeEnabled &&
    previous.isSelected === next.isSelected &&
    previous.hasAudioActivity === next.hasAudioActivity &&
    previous.isTalkbackTarget === next.isTalkbackTarget &&
    previous.onSelect === next.onSelect &&
    previous.onToggleTalkbackTarget === next.onToggleTalkbackTarget
  );
}

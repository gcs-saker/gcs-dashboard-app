import { memo, useCallback, type MouseEvent } from "react";
import { haveEqualFields } from "@/features/valueEquality";
import { RealtimePlayer } from "@streaming/components/RealtimePlayer";
import { isReceivableStream } from "@dashboard/streaming/dashboardCctv";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import {
  getStreamSecondaryLabel,
  getDashboardStreamStatusClass,
  getDashboardStreamStatusText,
} from "@dashboard/streaming/streamTypes";

interface StreamCardProps {
  stream: DashboardStreamSlot;
  isSelected: boolean;
  hasAudioActivity?: boolean;
  isTalkbackTarget?: boolean;
  onSelect: (streamId: string) => void;
  onToggleTalkbackTarget?: (streamPath: string) => void;
}

const STREAM_CARD_PROP_FIELDS: readonly (keyof Omit<StreamCardProps, "stream">)[] = [
  "isSelected", "hasAudioActivity", "isTalkbackTarget", "onSelect", "onToggleTalkbackTarget",
];
const STREAM_CARD_STREAM_FIELDS: readonly (keyof DashboardStreamSlot)[] = [
  "id", "title", "status", "mode", "detail", "connectedDeviceId", "streamPath", "aiModeEnabled",
];

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
  const toggleTalkback = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (stream.streamPath) {
      onToggleTalkbackTarget?.(stream.streamPath);
    }
  }, [onToggleTalkbackTarget, stream.streamPath]);
  const secondaryLabel = getStreamSecondaryLabel(stream);

  return (
    <article className={`stream-card ${isSelected ? "is-selected" : ""} ${hasAudioActivity ? "has-audio" : ""} ${isTalkbackTarget ? "is-talkback-target" : ""}`}
      onClick={selectStream}>
      <button
        aria-label={`${stream.title} 선택`}
        aria-pressed={isSelected}
        className="stream-card__select"
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
      {secondaryLabel ? <span className="stream-card__detail">{secondaryLabel}</span> : null}
      {isSelected ? <span className="stream-card__selected-link">현재 선택</span> : null}
      {!isSelected && isReceivableStream(stream) ? (
        <button className="stream-card__promote" type="button">
          선택 스트림으로 보기
        </button>
      ) : null}
      {onToggleTalkbackTarget ? (
        <button
          aria-pressed={isTalkbackTarget}
          className="stream-card__talkback"
          disabled={!canTalkback}
          onClick={toggleTalkback}
          type="button"
        >
          {isTalkbackTarget ? "송신 대상 선택됨" : "음성 송신 대상"}
        </button>
      ) : null}
    </article>
  );
}, areStreamCardPropsEqual);

function areStreamCardPropsEqual(previous: StreamCardProps, next: StreamCardProps): boolean {
  return haveEqualFields(previous, next, STREAM_CARD_PROP_FIELDS) &&
    haveEqualFields(previous.stream, next.stream, STREAM_CARD_STREAM_FIELDS);
}

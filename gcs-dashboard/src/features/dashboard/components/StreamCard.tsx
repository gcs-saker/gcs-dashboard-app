import type { DashboardStreamSlot } from "../streamTypes";
import {
  getDashboardStreamDisplayName,
  getDashboardStreamStatusClass,
  getDashboardStreamStatusText,
} from "../streamTypes";

interface StreamCardProps {
  stream: DashboardStreamSlot;
  isSelected: boolean;
  hasAudioActivity?: boolean;
  isTalkbackTarget?: boolean;
  onSelect: (streamId: string) => void;
  onToggleTalkbackTarget?: (streamPath: string) => void;
}

export function StreamCard({
  stream,
  isSelected,
  hasAudioActivity = false,
  isTalkbackTarget = false,
  onSelect,
  onToggleTalkbackTarget,
}: StreamCardProps) {
  const canTalkback = Boolean(stream.streamPath);
  return (
    <article className={`stream-card ${isSelected ? "is-selected" : ""} ${hasAudioActivity ? "has-audio" : ""} ${isTalkbackTarget ? "is-talkback-target" : ""}`}>
      <button
        aria-label={`${stream.title} 선택`}
        aria-pressed={isSelected}
        className="stream-card__select"
        onClick={() => onSelect(stream.id)}
        type="button"
      >
        <span className="stream-card__topline">
          <strong>{stream.title}</strong>
          <span className={`ops-badge ${getDashboardStreamStatusClass(stream.status)}`}>
            {getDashboardStreamStatusText(stream.status)}
          </span>
          {hasAudioActivity ? <span className="stream-card__audio">음성</span> : null}
        </span>
        <span className={`stream-card__visual mode-${stream.mode.toLowerCase()}`}>
          <span className="reticle" />
        </span>
        <span className="stream-card__detail">{getDashboardStreamDisplayName(stream)}</span>
      </button>
      {onToggleTalkbackTarget ? (
        <button
          aria-pressed={isTalkbackTarget}
          className="stream-card__talkback"
          disabled={!canTalkback}
          onClick={() => stream.streamPath && onToggleTalkbackTarget(stream.streamPath)}
          type="button"
        >
          음성 송신 대상
        </button>
      ) : null}
    </article>
  );
}

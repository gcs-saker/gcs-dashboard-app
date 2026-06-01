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
  onSelect: (streamId: string) => void;
}

export function StreamCard({ stream, isSelected, hasAudioActivity = false, onSelect }: StreamCardProps) {
  return (
    <button
      aria-label={`${stream.title} 선택`}
      aria-pressed={isSelected}
      className={`stream-card ${isSelected ? "is-selected" : ""} ${hasAudioActivity ? "has-audio" : ""}`}
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
  );
}

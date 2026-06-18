import { memo, useCallback } from "react";
import {
  getDashboardStreamDisplayName,
  getDashboardStreamStatusClass,
  getDashboardStreamStatusText,
  type DashboardStreamSlot,
} from "../streamTypes";

export type CctvQualityMode = "preview" | "high";

interface CctvChannelCardProps {
  stream: DashboardStreamSlot;
  isSelected: boolean;
  hasAudioActivity: boolean;
  qualityMode: CctvQualityMode;
  onSelect: (streamId: string) => void;
}

export const CctvChannelCard = memo(function CctvChannelCard({
  stream,
  isSelected,
  hasAudioActivity,
  qualityMode,
  onSelect,
}: CctvChannelCardProps) {
  const selectStream = useCallback(() => onSelect(stream.id), [onSelect, stream.id]);
  const sourceLabel = stream.sourceUrl ?? stream.streamPath ?? "주소 미연결";
  const statusText = getDashboardStreamStatusText(stream.status);

  return (
    <article className={`cctv-channel-card ${isSelected ? "is-selected" : ""} ${hasAudioActivity ? "has-audio" : ""}`}>
      <button
        aria-label={`${stream.title} 선택`}
        aria-pressed={isSelected}
        className="cctv-channel-card__viewport"
        onClick={selectStream}
        type="button"
      >
        <span className="cctv-channel-card__channel">{stream.title.replace("CCTV ", "CH ")}</span>
        <span className="cctv-channel-card__scanline" />
        <span className="cctv-channel-card__reticle" />
        <span className="cctv-channel-card__empty">{stream.streamPath ? getDashboardStreamDisplayName(stream) : "채널 미연결"}</span>
      </button>
      <div className="cctv-channel-card__meta">
        <strong>{stream.title}</strong>
        <span className={`ops-badge ${getDashboardStreamStatusClass(stream.status)}`}>{statusText}</span>
        {hasAudioActivity ? <span className="cctv-channel-card__audio">음성</span> : null}
      </div>
      <div className="cctv-channel-card__footer">
        <span title={sourceLabel}>{sourceLabel}</span>
        <em>{qualityMode === "preview" ? "Preview" : "High"}</em>
      </div>
      <div className="cctv-channel-card__statusbar" aria-label={`${stream.title} 수신 상태`}>
        <span>FPS {stream.status === "offline" ? "-" : qualityMode === "preview" ? "12" : "30"}</span>
        <span>RTT {stream.status === "offline" ? "-" : "42ms"}</span>
        <span>{stream.streamPath ? "REC ready" : "No path"}</span>
      </div>
      <button className="cctv-channel-card__connect" onClick={selectStream} type="button">
        주소 연결
      </button>
    </article>
  );
});

import { memo, useCallback } from "react";
import { RealtimePlayer } from "@streaming/components/RealtimePlayer";
import { isReceivableStream } from "@dashboard/streaming/dashboardCctv";
import {
  getDashboardStreamDisplayName,
  getDashboardStreamStatusClass,
  getDashboardStreamStatusText,
  type DashboardStreamSlot,
} from "@dashboard/streaming/streamTypes";

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
  const receivable = isReceivableStream(stream);
  const sourceLabel = receivable ? "실시간 수신" : stream.streamPath ? "송출 대기" : "스트림 미선택";
  const statusText = getDashboardStreamStatusText(stream.status);

  return (
    <article className={`cctv-channel-card ${isSelected ? "is-selected" : ""} ${hasAudioActivity ? "has-audio" : ""}`}>
      <div className="cctv-channel-card__viewport">
        {receivable ? <RealtimePlayer controls={false} muted streamId={stream.streamPath}
          title={`${stream.title} CCTV`} /> : null}
        <button aria-label={`${stream.title} 선택`} aria-pressed={isSelected}
          className="cctv-channel-card__select" onClick={selectStream} type="button" />
        {!receivable ? <><span className="cctv-channel-card__scanline" /><span className="cctv-channel-card__reticle" />
          <span className="cctv-channel-card__empty">{stream.streamPath ? getDashboardStreamDisplayName(stream) : "채널 미연결"}</span></> : null}
        <div className="cctv-channel-card__overlay cctv-channel-card__overlay--top">
          <strong>{stream.title}</strong>
          <span className={`ops-badge ${getDashboardStreamStatusClass(stream.status)}`}>{statusText}</span>
          {hasAudioActivity ? <span className="cctv-channel-card__audio">음성</span> : null}
        </div>
        <div className="cctv-channel-card__overlay cctv-channel-card__overlay--bottom"
          aria-label={`${stream.title} 수신 상태`}>
          <span title={sourceLabel}>{sourceLabel}</span>
          <span>{hasAudioActivity ? "오디오 수신" : "오디오 대기"}</span>
          <span>{stream.geometry ? "좌표 수신" : "좌표 대기"}</span>
          <em>{qualityMode === "preview" ? "간소 보기" : "상세 보기"}</em>
        </div>
      </div>
    </article>
  );
});

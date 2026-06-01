import type { ReactNode } from "react";
import { RealtimePlayer } from "../../streaming/components/RealtimePlayer";
import type { RealtimePlayerSnapshot } from "../../streaming/types";
import type { DashboardStreamSlot } from "../streamTypes";
import {
  getDashboardStreamStatusClass,
  getDashboardStreamStatusText,
  getDashboardStreamDisplayName,
  SELECTED_STREAM_WIDGET,
} from "../streamTypes";

interface SelectedStreamPanelProps {
  stream: DashboardStreamSlot;
  controls?: ReactNode;
  hasAudioActivity?: boolean;
  isPinned?: boolean;
  onPlaybackStatusChange?: (streamId: string, snapshot: RealtimePlayerSnapshot) => void;
  onToggleAiMode?: (streamId: string) => void;
}

export function SelectedStreamPanel({
  stream,
  controls,
  hasAudioActivity = false,
  isPinned = false,
  onPlaybackStatusChange,
  onToggleAiMode,
}: SelectedStreamPanelProps) {
  return (
    <section
      aria-labelledby="selected-stream-title"
      className={`ops-panel selected-stream ${isPinned ? "is-pinned" : ""} ${hasAudioActivity ? "has-audio" : ""}`}
      data-widget-id={SELECTED_STREAM_WIDGET.id}
      style={{ minHeight: SELECTED_STREAM_WIDGET.minHeight }}
    >
      <div className="ops-panel__header">
        <h2 id="selected-stream-title">선택 스트림</h2>
        <span className="ops-panel__header-actions">
          <span className={`ops-badge ${getDashboardStreamStatusClass(stream.status)}`}>
            {getDashboardStreamStatusText(stream.status)}
          </span>
          <button
            aria-pressed={Boolean(stream.aiModeEnabled)}
            className={`ops-command-button stream-ai-toggle ${stream.aiModeEnabled ? "is-active" : ""}`}
            onClick={() => onToggleAiMode?.(stream.id)}
            type="button"
          >
            AI 모드
          </button>
          {controls}
        </span>
      </div>
      <div className={`selected-stream__viewport mode-${stream.mode.toLowerCase()}`}>
        {stream.streamPath ? (
          <RealtimePlayer
            onStatusChange={(snapshot) => onPlaybackStatusChange?.(stream.id, snapshot)}
            streamId={stream.streamPath}
            title={stream.title}
          />
        ) : (
          <div className="reticle" />
        )}
        <div className="selected-stream__meta">
          <strong>{stream.title}</strong>
          <span>{getDashboardStreamDisplayName(stream)}</span>
          {hasAudioActivity ? <span>음성 수신 중</span> : null}
          {stream.aiModeEnabled ? <span>AI 필터 준비됨</span> : null}
        </div>
      </div>
    </section>
  );
}

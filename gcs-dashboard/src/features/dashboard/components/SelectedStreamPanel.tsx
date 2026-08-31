import type { ReactNode } from "react";
import { RENDER_DIAGNOSTIC_LABELS, useRenderDiagnostics } from "@/features/renderDiagnostics";
import { RealtimePlayer } from "@streaming/components/RealtimePlayer";
import type { RealtimePlayerSnapshot } from "@streaming/types";
import type { DashboardStreamSlot } from "@dashboard/streamTypes";
import {
  getDashboardStreamStatusClass,
  getDashboardStreamStatusText,
  getDashboardStreamDisplayName,
  SELECTED_STREAM_WIDGET,
} from "@dashboard/streamTypes";

interface SelectedStreamPanelProps {
  stream: DashboardStreamSlot;
  controls?: ReactNode;
  hasAudioActivity?: boolean;
  isPinned?: boolean;
  isTalkbackTarget?: boolean;
  onPlaybackStatusChange?: (streamId: string, snapshot: RealtimePlayerSnapshot) => void;
  onToggleAiMode?: (streamId: string) => void;
  onToggleTalkbackTarget?: (streamPath: string) => void;
}

export function SelectedStreamPanel({
  stream,
  controls,
  hasAudioActivity = false,
  isPinned = false,
  isTalkbackTarget = false,
  onPlaybackStatusChange,
  onToggleAiMode,
  onToggleTalkbackTarget,
}: SelectedStreamPanelProps) {
  useRenderDiagnostics(RENDER_DIAGNOSTIC_LABELS.selectedStreamPanel);
  return (
    <section
      aria-labelledby="selected-stream-title"
      className={`ops-panel selected-stream ${isPinned ? "is-pinned" : ""} ${hasAudioActivity ? "has-audio" : ""}`}
      data-widget-id={SELECTED_STREAM_WIDGET.id}
      style={{ minHeight: SELECTED_STREAM_WIDGET.minHeight }}
    >
      <div className="ops-panel__header">
        <span className="selected-stream__heading">
          <h2 id="selected-stream-title">선택 스트림</h2>
          <span>{stream.title} / {getDashboardStreamDisplayName(stream)}</span>
        </span>
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
          <button
            aria-label="음성 송신 대상"
            aria-pressed={isTalkbackTarget}
            className={`ops-command-button selected-stream__talkback-target ${isTalkbackTarget ? "is-active" : ""}`}
            disabled={!stream.streamPath}
            onClick={() => stream.streamPath && onToggleTalkbackTarget?.(stream.streamPath)}
            type="button"
          >
            송신 대상
          </button>
          {controls}
        </span>
      </div>
      <div className={`selected-stream__viewport mode-${stream.mode.toLowerCase()}`}>
        {stream.streamPath ? (
          <RealtimePlayer
            controls={false}
            onStatusChange={(snapshot) => onPlaybackStatusChange?.(stream.id, snapshot)}
            streamId={stream.streamPath}
            title={stream.title}
          />
        ) : (
          <div className="selected-stream__empty">
            <span className="selected-stream__empty-kicker">NO ACTIVE STREAM</span>
            <strong>스트림 주소를 연결하세요</strong>
            <p>탐지된 장비 또는 직접 입력한 WHEP/HLS 경로를 선택하면 이 영역에서 수신 상태를 확인합니다.</p>
          </div>
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

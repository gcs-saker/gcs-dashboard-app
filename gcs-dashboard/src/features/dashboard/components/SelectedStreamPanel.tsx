import { useEffect, useState, type ReactNode } from "react";
import { RENDER_DIAGNOSTIC_LABELS, useRenderDiagnostics } from "@/features/renderDiagnostics";
import { RealtimePlayer } from "@streaming/components/RealtimePlayer";
import { StreamTelemetryOverlay } from "@streaming/components/StreamTelemetryOverlay";
import type { RealtimePlayerSnapshot } from "@streaming/types";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import { isReceivableStream } from "@dashboard/streaming/dashboardCctv";
import { useStreamCameraControl } from "@dashboard/hooks/useStreamCameraControl";
import {
  getDashboardStreamStatusClass,
  getDashboardStreamStatusText,
  getStreamSecondaryLabel,
  SELECTED_STREAM_WIDGET,
} from "@dashboard/streaming/streamTypes";

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
  const [audioEnabled, setAudioEnabled] = useState(false);
  const cameraControl = useStreamCameraControl(stream.streamPath);
  useEffect(() => setAudioEnabled(false), [stream.id]);
  const secondaryLabel = getStreamSecondaryLabel(stream);
  return (
    <section
      aria-labelledby="selected-stream-title"
      className={`ops-panel selected-stream ${isPinned ? "is-pinned" : ""} ${hasAudioActivity ? "has-audio" : ""}`}
      data-widget-id={SELECTED_STREAM_WIDGET.id}
      style={{ minHeight: SELECTED_STREAM_WIDGET.minHeight }}
    >
      <SelectedStreamHeader audioEnabled={audioEnabled} controls={controls} isTalkbackTarget={isTalkbackTarget}
        onAudioToggle={() => setAudioEnabled((current) => !current)} onToggleAiMode={onToggleAiMode}
        onToggleTalkbackTarget={onToggleTalkbackTarget} stream={stream} />
      <div className={`selected-stream__viewport mode-${stream.mode.toLowerCase()}`}>
        {isReceivableStream(stream) ? (
          <RealtimePlayer
            controls={false}
            muted={!audioEnabled}
            onStatusChange={(snapshot) => onPlaybackStatusChange?.(stream.id, snapshot)}
            streamId={stream.streamPath}
            title={stream.title}
          />
        ) : (
          <div className="selected-stream__empty">
            <span className="selected-stream__empty-kicker">NO ACTIVE STREAM</span>
            <strong>수신 가능한 스트림이 없습니다</strong>
            <p>서버가 탐지한 온라인 스트림을 선택하면 이 영역에서 수신 상태를 확인합니다.</p>
          </div>
        )}
        {isReceivableStream(stream) ? <StreamTelemetryOverlay geometry={stream.geometry} /> : null}
        {isReceivableStream(stream) ? <CameraDirectionOverlay cameraControl={cameraControl} /> : null}
        <div className="selected-stream__meta">
          <strong>{stream.title}</strong>
          {secondaryLabel ? <span>{secondaryLabel}</span> : null}
          {hasAudioActivity ? <span>음성 수신 중</span> : null}
          {stream.aiModeEnabled ? <span>AI 필터 준비됨</span> : null}
        </div>
        {cameraControl.message ? <span className="selected-stream__camera-message" role="status">{cameraControl.message}</span> : null}
      </div>
    </section>
  );
}

function SelectedStreamHeader({
  audioEnabled,
  controls,
  isTalkbackTarget,
  onAudioToggle,
  onToggleAiMode,
  onToggleTalkbackTarget,
  stream,
}: Pick<SelectedStreamPanelProps, "controls" | "isTalkbackTarget" | "onToggleAiMode" | "onToggleTalkbackTarget" | "stream"> & {
  audioEnabled: boolean;
  onAudioToggle: () => void;
}) {
  const secondaryLabel = getStreamSecondaryLabel(stream);
  return (
    <div className="ops-panel__header">
      <span className="selected-stream__heading">
        <h2 id="selected-stream-title">선택 스트림</h2>
        <span>{stream.title}{secondaryLabel ? ` · ${secondaryLabel}` : ""}</span>
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
        >AI 모드</button>
        <button
          aria-pressed={audioEnabled}
          className={`ops-command-button ${audioEnabled ? "is-active" : ""}`}
          disabled={!isReceivableStream(stream)}
          onClick={onAudioToggle}
          type="button"
        >{audioEnabled ? "음성 끄기" : "음성 켜기"}</button>
        <button aria-label="음성 송신 대상" aria-pressed={isTalkbackTarget}
          className={`ops-command-button ${isTalkbackTarget ? "is-active" : ""}`}
          disabled={!isReceivableStream(stream)}
          onClick={() => stream.streamPath && onToggleTalkbackTarget?.(stream.streamPath)} type="button">
          송신 대상
        </button>
        {controls}
      </span>
    </div>
  );
}

function CameraDirectionOverlay({ cameraControl }: {
  cameraControl: ReturnType<typeof useStreamCameraControl>;
}) {
  return <span className="selected-stream__camera-controls" role="group" aria-label="모바일 카메라 방향">
    <small>카메라</small>
    <button disabled={cameraControl.pendingMode !== null}
      onClick={() => void cameraControl.requestFacingMode("front")} type="button">전면</button>
    <button disabled={cameraControl.pendingMode !== null}
      onClick={() => void cameraControl.requestFacingMode("rear")} type="button">후면</button>
  </span>;
}

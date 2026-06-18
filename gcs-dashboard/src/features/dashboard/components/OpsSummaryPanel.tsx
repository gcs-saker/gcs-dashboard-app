import type { ReactNode } from "react";
import type { DashboardWidgetDefinition } from "../dashboardLayout";
import {
  getDashboardStreamDisplayName,
  getDashboardStreamStatusText,
  type DashboardStreamSlot,
} from "../streamTypes";
import {
  formatBearing,
  formatPlaybackMode,
  getJitterTone,
  type AudioAnalysisSnapshot,
  type StatusNote,
  type StatusTile,
  type StatusTone,
} from "../dashboardPresentation";

interface OpsSummaryPanelProps {
  audioAnalysis: AudioAnalysisSnapshot | null;
  controls: ReactNode;
  selectedStream: DashboardStreamSlot;
  streamCount: number;
  talkbackTargetCount: number;
  widget: DashboardWidgetDefinition;
}

export function OpsSummaryPanel({
  audioAnalysis,
  controls,
  selectedStream,
  streamCount,
  talkbackTargetCount,
  widget,
}: OpsSummaryPanelProps) {
  const gpsText = selectedStream.geometry ? "좌표 수신" : "좌표 대기";
  const audioText = audioAnalysis?.streamId === selectedStream.id && audioAnalysis.isAudioActive ? "음성 수신" : "음성 대기";
  const aiText = selectedStream.aiModeEnabled ? "AI 준비" : "AI 꺼짐";
  const selectedStatusText = getDashboardStreamStatusText(selectedStream.status);
  const icePathNote = formatIcePathNote(audioAnalysis);
  const missionTone: StatusTone =
    selectedStream.status === "online" ? "good" : selectedStream.status === "offline" ? "danger" : "warning";
  const missionText =
    selectedStream.status === "online"
      ? "실시간 운용 가능"
      : selectedStream.status === "offline"
        ? "송출 대기"
        : "경로 점검 필요";
  const statusTiles: StatusTile[] = [
    { label: "스트림", value: `${streamCount}개`, tone: "info" },
    { label: "GPS", value: gpsText, tone: selectedStream.geometry ? "good" : "muted" },
    { label: "오디오", value: audioText, tone: audioText === "음성 수신" ? "good" : "muted" },
    { label: "Talkback", value: talkbackTargetCount ? `${talkbackTargetCount} 대상` : "대기", tone: talkbackTargetCount ? "info" : "muted" },
  ];
  const statusNotes: StatusNote[] = [
    { label: selectedStream.geometry ? "GPS 정상" : "GPS 대기", tone: selectedStream.geometry ? "good" : "muted" },
    {
      label: icePathNote ?? (selectedStream.status === "online" ? "WebRTC 경로 확인 중" : selectedStatusText),
      tone: audioAnalysis?.localCandidateType === "relay"
        ? "warning"
        : selectedStream.status === "online"
          ? "good"
          : selectedStream.status === "offline"
            ? "danger"
            : "warning",
    },
    {
      label: audioAnalysis?.jitterMs !== null && audioAnalysis?.jitterMs !== undefined
        ? `음성 지터 ${Math.round(audioAnalysis.jitterMs)}ms`
        : "음성 분석 대기",
      tone: getJitterTone(audioAnalysis?.jitterMs ?? null),
    },
    { label: aiText, tone: selectedStream.aiModeEnabled ? "info" : "muted" },
  ];
  const recentEvents: StatusNote[] = [
    { label: `${getDashboardStreamDisplayName(selectedStream)} 선택됨`, tone: "info" },
    { label: selectedStream.geometry ? "지도 포커스 좌표 동기화" : "지도 좌표 대기", tone: selectedStream.geometry ? "good" : "muted" },
    {
      label: audioAnalysis?.streamId === selectedStream.id ? `재생 경로 ${formatPlaybackMode(audioAnalysis.mode, selectedStream.status)}` : "재생 품질 수집 대기",
      tone: audioAnalysis?.streamId === selectedStream.id ? "info" : "muted",
    },
  ];

  return (
    <section
      aria-labelledby="ops-summary-title"
      className="ops-panel ops-summary"
      data-widget-id={widget.id}
      style={{ minHeight: widget.minHeight, minWidth: widget.minWidth }}
    >
      <div className="ops-panel__header">
        <h2 id="ops-summary-title">운용 요약</h2>
        {controls}
      </div>
      <div className="ops-summary__body">
        <div className={`ops-summary__mission is-${missionTone}`}>
          <span>현재 운용 상태</span>
          <strong>{missionText}</strong>
          <em>{selectedStatusText}</em>
        </div>
        <div className="ops-summary__selected">
          <span>선택 스트림</span>
          <strong>{getDashboardStreamDisplayName(selectedStream)}</strong>
          <em className={`ops-summary__state is-${selectedStream.status}`}>{selectedStatusText}</em>
        </div>
        <div className="ops-summary__focus">
          <strong>{selectedStream.geometry ? `${selectedStream.geometry.lat.toFixed(5)}, ${selectedStream.geometry.lng.toFixed(5)}` : "좌표 대기"}</strong>
          <span>{selectedStream.geometry ? `고도 ${selectedStream.geometry.altitudeM.toFixed(1)}m · 방위 ${formatBearing(selectedStream.geometry.headingDeg)}` : "GPS 수신 후 지도와 동기화됩니다."}</span>
        </div>
        <dl className="ops-summary__tiles">
          {statusTiles.map((tile) => (
            <div className={`is-${tile.tone}`} key={tile.label}>
              <dt>{tile.label}</dt>
              <dd>{tile.value}</dd>
            </div>
          ))}
        </dl>
        <div className="ops-summary__notes" aria-label="주의 / 상태">
          <span>주의 / 상태</span>
          <ul>
            {statusNotes.map((note) => (
              <li className={`is-${note.tone}`} key={note.label}>{note.label}</li>
            ))}
          </ul>
        </div>
        <div className="ops-summary__events" aria-label="최근 상태">
          <span>최근 상태</span>
          <ul>
            {recentEvents.map((event) => (
              <li className={`is-${event.tone}`} key={event.label}>{event.label}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function formatIcePathNote(audioAnalysis: AudioAnalysisSnapshot | null): string | null {
  if (!audioAnalysis?.localCandidateType && !audioAnalysis?.remoteCandidateType) return null;
  const local = audioAnalysis.localCandidateType ?? "?";
  const remote = audioAnalysis.remoteCandidateType ?? "?";
  const protocol = audioAnalysis.iceTransportProtocol ? `/${audioAnalysis.iceTransportProtocol.toUpperCase()}` : "";
  return `ICE ${local}->${remote}${protocol}`;
}

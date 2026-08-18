import {
  getDashboardStreamDisplayName,
  getDashboardStreamStatusText,
  type DashboardStreamSlot,
} from "./streamTypes";
import {
  formatBearing,
  formatPlaybackMode,
  getJitterTone,
  type AudioAnalysisSnapshot,
  type StatusNote,
  type StatusTile,
  type StatusTone,
} from "./dashboardPresentation";
import { telemetryFreshnessForStream } from "./telemetryFreshness";

export interface OpsSummaryViewModel {
  readonly focusDetail: string;
  readonly focusTitle: string;
  readonly missionText: string;
  readonly missionTone: StatusTone;
  readonly recentEvents: StatusNote[];
  readonly selectedStatusText: string;
  readonly statusNotes: StatusNote[];
  readonly statusTiles: StatusTile[];
  readonly streamDisplayName: string;
}

export function buildOpsSummaryViewModel(
  selectedStream: DashboardStreamSlot,
  audioAnalysis: AudioAnalysisSnapshot | null,
  streamCount: number,
  talkbackTargetCount: number,
): OpsSummaryViewModel {
  const selectedStatusText = getDashboardStreamStatusText(selectedStream.status);
  const telemetryFreshness = telemetryFreshnessForStream(selectedStream);
  const hasTelemetry = telemetryFreshness !== "unavailable" && Boolean(selectedStream.geometry);
  const gpsText = telemetryFreshness === "fresh" ? "좌표 수신" : telemetryFreshness === "stale" ? "마지막 좌표" : "좌표 대기";
  const audioText = audioAnalysis?.streamId === selectedStream.id && audioAnalysis.isAudioActive ? "음성 수신" : "음성 대기";

  return {
    focusDetail: hasTelemetry && selectedStream.geometry
      ? `고도 ${selectedStream.geometry.altitudeM.toFixed(1)}m · 방위 ${formatBearing(selectedStream.geometry.headingDeg)}`
      : "GPS 수신 후 지도와 동기화됩니다.",
    focusTitle: hasTelemetry && selectedStream.geometry
      ? `${selectedStream.geometry.lat.toFixed(5)}, ${selectedStream.geometry.lng.toFixed(5)}`
      : "좌표 대기",
    missionText: missionTextForStatus(selectedStream.status),
    missionTone: missionToneForStatus(selectedStream.status),
    recentEvents: buildRecentEvents(selectedStream, audioAnalysis),
    selectedStatusText,
    statusNotes: buildStatusNotes(selectedStream, audioAnalysis, selectedStatusText, telemetryFreshness),
    statusTiles: [
      { label: "스트림", value: `${streamCount}개`, tone: "info" },
      { label: "GPS", value: gpsText, tone: telemetryFreshness === "fresh" ? "good" : telemetryFreshness === "stale" ? "warning" : "muted" },
      { label: "오디오", value: audioText, tone: audioText === "음성 수신" ? "good" : "muted" },
      { label: "Talkback", value: talkbackTargetCount ? `${talkbackTargetCount} 대상` : "대기", tone: talkbackTargetCount ? "info" : "muted" },
    ],
    streamDisplayName: getDashboardStreamDisplayName(selectedStream),
  };
}

function buildStatusNotes(
  selectedStream: DashboardStreamSlot,
  audioAnalysis: AudioAnalysisSnapshot | null,
  selectedStatusText: string,
  telemetryFreshness: ReturnType<typeof telemetryFreshnessForStream>,
): StatusNote[] {
  const icePathNote = formatIcePathNote(audioAnalysis);
  return [
    { label: telemetryFreshness === "fresh" ? "GPS 정상" : telemetryFreshness === "stale" ? "GPS 갱신 대기" : "GPS 대기", tone: telemetryFreshness === "fresh" ? "good" : telemetryFreshness === "stale" ? "warning" : "muted" },
    {
      label: icePathNote ?? (selectedStream.status === "online" ? "WebRTC 경로 확인 중" : selectedStatusText),
      tone: audioAnalysis?.localCandidateType === "relay" ? "warning" : missionToneForStatus(selectedStream.status),
    },
    {
      label: audioAnalysis?.jitterMs !== null && audioAnalysis?.jitterMs !== undefined
        ? `음성 지터 ${Math.round(audioAnalysis.jitterMs)}ms`
        : "음성 분석 대기",
      tone: getJitterTone(audioAnalysis?.jitterMs ?? null),
    },
    { label: selectedStream.aiModeEnabled ? "AI 준비" : "AI 꺼짐", tone: selectedStream.aiModeEnabled ? "info" : "muted" },
  ];
}

function buildRecentEvents(
  selectedStream: DashboardStreamSlot,
  audioAnalysis: AudioAnalysisSnapshot | null,
): StatusNote[] {
  return [
    { label: `${getDashboardStreamDisplayName(selectedStream)} 선택됨`, tone: "info" },
    { label: selectedStream.geometry ? "지도 포커스 좌표 동기화" : "지도 좌표 대기", tone: selectedStream.geometry ? "good" : "muted" },
    {
      label: audioAnalysis?.streamId === selectedStream.id
        ? `재생 경로 ${formatPlaybackMode(audioAnalysis.mode, selectedStream.status)}`
        : "재생 품질 수집 대기",
      tone: audioAnalysis?.streamId === selectedStream.id ? "info" : "muted",
    },
  ];
}

function formatIcePathNote(audioAnalysis: AudioAnalysisSnapshot | null): string | null {
  if (!audioAnalysis?.localCandidateType && !audioAnalysis?.remoteCandidateType) return null;
  const local = audioAnalysis.localCandidateType ?? "?";
  const remote = audioAnalysis.remoteCandidateType ?? "?";
  const protocol = audioAnalysis.iceTransportProtocol ? `/${audioAnalysis.iceTransportProtocol.toUpperCase()}` : "";
  return `ICE ${local}->${remote}${protocol}`;
}

function missionTextForStatus(status: DashboardStreamSlot["status"]): string {
  if (status === "online") return "실시간 운용 가능";
  if (status === "offline") return "송출 대기";
  return "경로 점검 필요";
}

function missionToneForStatus(status: DashboardStreamSlot["status"]): StatusTone {
  if (status === "online") return "good";
  if (status === "offline") return "danger";
  return "warning";
}

import { memo, useMemo, type CSSProperties } from "react";
import { RENDER_DIAGNOSTIC_LABELS, useRenderDiagnostics } from "@/features/renderDiagnostics";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
import {
  buildAudioWaveformBars,
  formatPlaybackMode,
  getJitterTone,
  getLatencyTone,
  getPacketLossTone,
  type AudioAnalysisSnapshot,
} from "@dashboard/layout/dashboardPresentation";
import { useRafNumber } from "@/features/shared/hooks/useRafNumber";
import type { TalkbackPublisherSnapshot } from "@streaming/talkback/talkbackPublisherContracts";

interface AudioWaveformPanelProps {
  analysis: AudioAnalysisSnapshot | null;
  isMotionEnabled?: boolean;
  selectedStream: DashboardStreamSlot;
  talkback: TalkbackPublisherSnapshot;
}

export const AudioWaveformPanel = memo(function AudioWaveformPanel({
  analysis,
  isMotionEnabled = true,
  selectedStream,
  talkback,
}: AudioWaveformPanelProps) {
  useRenderDiagnostics(RENDER_DIAGNOSTIC_LABELS.audioWaveformPanel);
  const isSelectedAnalysis = analysis?.streamId === selectedStream.id;
  const isActive = Boolean(analysis?.isAudioActive);
  const hasTrack = Boolean(analysis?.hasAudioTrack);
  const isMicActive = talkback.hasLocalAudioTrack;
  const audioLevel = isMicActive ? talkback.micLevel : analysis?.audioLevel ?? null;
  const displayLevel = audioLevel ?? (isActive || isMicActive ? 0.18 : null);
  const rafAudioLevel = useRafNumber(audioLevel ?? 0, isActive && isMotionEnabled);
  const bars = useMemo(
    () => buildAudioWaveformBars(displayLevel === null ? null : audioLevel === null ? displayLevel : rafAudioLevel, isActive || hasTrack),
    [audioLevel, displayLevel, hasTrack, isActive, rafAudioLevel],
  );
  const sourceName = isMicActive ? "관제 마이크" : analysis?.title ?? selectedStream.title;
  const modeText = isMicActive ? "송신 음성" : analysis ? formatPlaybackMode(analysis.mode, analysis.streamStatus) : "대기";
  const latencyText = analysis?.firstFrameLatencyMs !== null && analysis?.firstFrameLatencyMs !== undefined ? `${analysis.firstFrameLatencyMs} ms` : "대기";
  const jitterText = analysis?.jitterMs !== null && analysis?.jitterMs !== undefined ? `${analysis.jitterMs} ms` : "대기";
  const lostText = analysis?.packetsLost !== null && analysis?.packetsLost !== undefined ? String(analysis.packetsLost) : "0";
  const iceRttText = analysis?.iceRoundTripTimeMs !== null && analysis?.iceRoundTripTimeMs !== undefined
    ? `${analysis.iceRoundTripTimeMs} ms`
    : "대기";
  const icePathText = formatIcePath(analysis?.localCandidateType ?? null, analysis?.remoteCandidateType ?? null, analysis?.iceTransportProtocol ?? null);
  const levelText = audioLevel !== null ? `${Math.round(audioLevel * 100)}%` : "대기";
  const latencyTone = getLatencyTone(analysis?.firstFrameLatencyMs ?? null);
  const jitterTone = getJitterTone(analysis?.jitterMs ?? null);
  const lossTone = getPacketLossTone(analysis?.packetsLost ?? null);
  const iceTone = analysis?.localCandidateType === "relay" ? "warning" : analysis?.localCandidateType ? "good" : "info";
  const scopeText = isMicActive ? "마이크 송신 레벨" : isSelectedAnalysis ? "선택 스트림 품질" : analysis ? "최근 음성 수신" : "선택 스트림 품질";

  return (
    <section aria-labelledby="audio-waveform-title" className={`ops-panel audio-waveform ${isActive ? "has-audio" : ""}`}>
      <div className="ops-panel__header">
        <h2 id="audio-waveform-title">음성 파형 분석</h2>
        <span className="ops-panel__header-actions">
          <span className={`ops-badge ${isActive ? "is-online" : hasTrack ? "is-warning" : "is-offline"}`}>
            {isMicActive ? "송신 중" : isActive ? "수신 중" : hasTrack ? "음성 대기" : "신호 대기"}
          </span>
        </span>
      </div>
      <div className="audio-waveform__body">
        <div className="audio-waveform__caption">
          <span>{scopeText}</span>
          <strong>{modeText}</strong>
        </div>
        <div className="audio-waveform__scope" aria-label="수신 음성 파형">
          {bars.map((height, index) => (
            <span key={`${selectedStream.id}-${index}`} style={{ "--bar-height": `${height}%` } as CSSProperties} />
          ))}
        </div>
        <dl>
          <div>
            <dt>대상</dt>
            <dd>{sourceName}</dd>
          </div>
          <div>
            <dt>레벨</dt>
            <dd>{levelText}</dd>
          </div>
          <div className={`is-${latencyTone}`}>
            <dt>지연</dt>
            <dd>{latencyText}</dd>
          </div>
          <div className={`is-${jitterTone}`}>
            <dt>지터</dt>
            <dd>{jitterText}</dd>
          </div>
          <div className={`is-${lossTone}`}>
            <dt>손실</dt>
            <dd>{lostText}</dd>
          </div>
          <div className={`is-${iceTone}`}>
            <dt>ICE 경로</dt>
            <dd title={analysis?.relayFallbackReason ?? undefined}>{icePathText}</dd>
          </div>
          <div className={`is-${getLatencyTone(analysis?.iceRoundTripTimeMs ?? null)}`}>
            <dt>ICE RTT</dt>
            <dd>{iceRttText}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
});

function formatIcePath(
  localCandidateType: string | null,
  remoteCandidateType: string | null,
  transportProtocol: string | null,
): string {
  if (!localCandidateType && !remoteCandidateType) return "대기";
  const local = localCandidateType ?? "?";
  const remote = remoteCandidateType ?? "?";
  const protocol = transportProtocol ? `/${transportProtocol.toUpperCase()}` : "";
  return `${local}->${remote}${protocol}`;
}

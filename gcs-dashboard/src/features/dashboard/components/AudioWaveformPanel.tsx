import { memo } from "react";
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
import { useAudioWaveformHistory } from "@dashboard/hooks/useAudioWaveformHistory";
import { buildAudioWaveformTrace } from "@dashboard/layout/audioWaveformTrace";
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
  const selectedAnalysis = isSelectedAnalysis ? analysis : null;
  const isActive = Boolean(selectedAnalysis?.isAudioActive);
  const hasTrack = Boolean(selectedAnalysis?.hasAudioTrack);
  const isMicActive = talkback.hasLocalAudioTrack;
  const hasAudioSignal = isActive || hasTrack || isMicActive;
  const audioLevel = isMicActive ? talkback.micLevel : selectedAnalysis?.audioLevel ?? null;
  const waveformHistory = useAudioWaveformHistory({
    audioLevel,
    isSignalPresent: isMotionEnabled && hasAudioSignal,
    sourceId: isMicActive ? "operator-microphone" : selectedStream.id,
  });
  const samples = isMotionEnabled ? waveformHistory : buildAudioWaveformBars(audioLevel, hasAudioSignal);
  const tracePoints = buildAudioWaveformTrace(samples);
  const sourceName = isMicActive ? "관제 마이크" : selectedAnalysis?.title ?? selectedStream.title;
  const modeText = isMicActive ? "송신 음성" : selectedAnalysis ? formatPlaybackMode(selectedAnalysis.mode, selectedAnalysis.streamStatus) : "대기";
  const latencyText = selectedAnalysis?.firstFrameLatencyMs !== null && selectedAnalysis?.firstFrameLatencyMs !== undefined ? `${selectedAnalysis.firstFrameLatencyMs} ms` : "대기";
  const jitterText = selectedAnalysis?.jitterMs !== null && selectedAnalysis?.jitterMs !== undefined ? `${selectedAnalysis.jitterMs} ms` : "대기";
  const lostText = selectedAnalysis?.packetsLost !== null && selectedAnalysis?.packetsLost !== undefined ? String(selectedAnalysis.packetsLost) : "0";
  const iceRttText = selectedAnalysis?.iceRoundTripTimeMs !== null && selectedAnalysis?.iceRoundTripTimeMs !== undefined
    ? `${selectedAnalysis.iceRoundTripTimeMs} ms`
    : "대기";
  const icePathText = formatIcePath(selectedAnalysis?.localCandidateType ?? null, selectedAnalysis?.remoteCandidateType ?? null, selectedAnalysis?.iceTransportProtocol ?? null);
  const levelText = audioLevel !== null ? `${Math.round(audioLevel * 100)}%` : "대기";
  const latencyTone = getLatencyTone(selectedAnalysis?.firstFrameLatencyMs ?? null);
  const jitterTone = getJitterTone(selectedAnalysis?.jitterMs ?? null);
  const lossTone = getPacketLossTone(selectedAnalysis?.packetsLost ?? null);
  const iceTone = selectedAnalysis?.localCandidateType === "relay" ? "warning" : selectedAnalysis?.localCandidateType ? "good" : "info";
  const scopeText = isMicActive ? "마이크 송신 레벨" : "선택 스트림 수신 음성";

  return (
    <section aria-labelledby="audio-waveform-title" className={`ops-panel audio-waveform ${hasAudioSignal ? "has-audio" : ""}`}>
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
          <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">
            <line className="audio-waveform__baseline" x1="0" x2="100" y1="96" y2="96" />
            <polyline className="audio-waveform__trace" points={tracePoints} />
          </svg>
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
            <dd title={selectedAnalysis?.relayFallbackReason ?? undefined}>{icePathText}</dd>
          </div>
          <div className={`is-${getLatencyTone(selectedAnalysis?.iceRoundTripTimeMs ?? null)}`}>
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

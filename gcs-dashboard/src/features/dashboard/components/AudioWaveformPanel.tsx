import { useMemo, type CSSProperties } from "react";
import type { DashboardStreamSlot } from "../streamTypes";
import {
  buildAudioWaveformBars,
  formatPlaybackMode,
  getJitterTone,
  getLatencyTone,
  getPacketLossTone,
  type AudioAnalysisSnapshot,
} from "../dashboardPresentation";
import { useRafNumber } from "../hooks/useRafNumber";

interface AudioWaveformPanelProps {
  analysis: AudioAnalysisSnapshot | null;
  selectedStream: DashboardStreamSlot;
}

export function AudioWaveformPanel({ analysis, selectedStream }: AudioWaveformPanelProps) {
  const isSelectedAnalysis = analysis?.streamId === selectedStream.id;
  const isActive = Boolean(isSelectedAnalysis && analysis?.isAudioActive);
  const hasTrack = Boolean(isSelectedAnalysis && analysis?.hasAudioTrack);
  const audioLevel = isSelectedAnalysis ? analysis?.audioLevel ?? null : null;
  const rafAudioLevel = useRafNumber(audioLevel ?? 0, isActive);
  const bars = useMemo(
    () => buildAudioWaveformBars(audioLevel === null ? null : rafAudioLevel, isActive),
    [audioLevel, isActive, rafAudioLevel],
  );
  const sourceName = isSelectedAnalysis ? analysis?.title : selectedStream.title;
  const modeText = isSelectedAnalysis ? formatPlaybackMode(analysis?.mode ?? null, selectedStream.status) : "대기";
  const latencyText = isSelectedAnalysis && analysis?.firstFrameLatencyMs !== null ? `${analysis?.firstFrameLatencyMs} ms` : "대기";
  const jitterText = isSelectedAnalysis && analysis?.jitterMs !== null ? `${analysis?.jitterMs} ms` : "대기";
  const lostText = isSelectedAnalysis && analysis?.packetsLost !== null ? String(analysis?.packetsLost) : "0";
  const levelText = audioLevel !== null ? `${Math.round(audioLevel * 100)}%` : "대기";
  const latencyTone = getLatencyTone(analysis?.firstFrameLatencyMs ?? null);
  const jitterTone = getJitterTone(analysis?.jitterMs ?? null);
  const lossTone = getPacketLossTone(analysis?.packetsLost ?? null);

  return (
    <section aria-labelledby="audio-waveform-title" className={`ops-panel audio-waveform ${isActive ? "has-audio" : ""}`}>
      <div className="ops-panel__header">
        <h2 id="audio-waveform-title">음성 파형 분석</h2>
        <span className="ops-panel__header-actions">
          <span className={`ops-badge ${isActive ? "is-online" : hasTrack ? "is-warning" : "is-offline"}`}>
            {isActive ? "수신 중" : hasTrack ? "음성 대기" : "신호 대기"}
          </span>
        </span>
      </div>
      <div className="audio-waveform__body">
        <div className="audio-waveform__caption">
          <span>선택 스트림 품질</span>
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
        </dl>
      </div>
    </section>
  );
}

import type { RealtimePlayerSnapshot } from "@streaming/types";
import type { DashboardStreamSlot } from "./streamTypes";
export {
  formatBearing,
  formatBearingDelta,
  formatSignedDegree,
  geometrySourceLabel,
  normalizeDegrees,
  telemetryRowsForStream,
  type TelemetryRow,
} from "./dashboardTelemetryRows";

export type StatusTone = "good" | "warning" | "danger" | "muted" | "info";

abstract class NullableMetricTonePolicy {
  protected constructor(
    private readonly goodMax: number,
    private readonly warningMax: number,
  ) {}

  tone(value: number | null): StatusTone {
    if (value === null) return "muted";
    if (value <= this.goodMax) return "good";
    if (value <= this.warningMax) return "warning";
    return "danger";
  }
}

class LatencyTonePolicy extends NullableMetricTonePolicy {
  constructor() {
    super(450, 900);
  }
}

class JitterTonePolicy extends NullableMetricTonePolicy {
  constructor() {
    super(30, 80);
  }
}

class PacketLossTonePolicy extends NullableMetricTonePolicy {
  constructor() {
    super(0, 3);
  }
}

const latencyTonePolicy = new LatencyTonePolicy();
const jitterTonePolicy = new JitterTonePolicy();
const packetLossTonePolicy = new PacketLossTonePolicy();

export interface AudioAnalysisSnapshot {
  streamId: string;
  title: string;
  mode: RealtimePlayerSnapshot["mode"];
  streamStatus: RealtimePlayerSnapshot["streamStatus"];
  hasAudioTrack: boolean;
  isAudioActive: boolean;
  audioLevel: number | null;
  audioWaveform: readonly number[];
  firstFrameLatencyMs: number | null;
  whepResponseMs: number | null;
  jitterMs: number | null;
  packetsLost: number | null;
  iceRoundTripTimeMs: number | null;
  localCandidateType: string | null;
  remoteCandidateType: string | null;
  iceTransportProtocol: string | null;
  relayFallbackReason: string | null;
}

export interface StatusNote {
  label: string;
  tone: StatusTone;
}

export interface StatusTile extends StatusNote {
  value: string;
}

export function buildAudioWaveformBars(waveform: readonly number[] | null, hasTrack: boolean): number[] {
  if (!hasTrack || !waveform?.length) {
    return Array.from({ length: 28 }, () => 4);
  }
  return Array.from({ length: 28 }, (_, index) => {
    const sourceIndex = Math.min(waveform.length - 1, Math.floor(index * waveform.length / 28));
    const amplitude = Math.min(1, Math.max(0, waveform[sourceIndex] ?? 0));
    return Math.max(4, Math.round(amplitude * 96));
  });
}

export function formatPlaybackMode(
  mode: RealtimePlayerSnapshot["mode"] | null,
  streamStatus: DashboardStreamSlot["status"] | RealtimePlayerSnapshot["streamStatus"],
): string {
  if (mode === "webrtc") return "WebRTC";
  if (mode === "hls") return "HLS fallback";
  if (mode === "reconnecting") return "재연결";
  if (mode === "loading") return "연결 확인";
  if (mode === "error") return "경로 오류";
  if (mode === "offline" || streamStatus === "offline") return "오프라인";
  return "대기";
}

export function getLatencyTone(value: number | null): StatusTone {
  return latencyTonePolicy.tone(value);
}

export function getJitterTone(value: number | null): StatusTone {
  return jitterTonePolicy.tone(value);
}

export function getPacketLossTone(value: number | null): StatusTone {
  return packetLossTonePolicy.tone(value);
}

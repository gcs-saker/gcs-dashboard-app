import type { RealtimePlayerSnapshot } from "@streaming/types";
import type { DashboardStreamSlot } from "@dashboard/streaming/streamTypes";
export {
  formatBearing,
  formatBearingDelta,
  formatSignedDegree,
  geometrySourceLabel,
  normalizeDegrees,
  telemetryRowsForStream,
  type TelemetryRow,
} from "@dashboard/streaming/dashboardTelemetryRows";

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

export function buildAudioWaveformBars(audioLevel: number | null, isActive: boolean): number[] {
  if (!isActive || audioLevel === null) {
    return Array.from({ length: 28 }, () => 4);
  }
  const normalizedLevel = Math.min(1, Math.max(0, audioLevel));
  const baseHeight = 12 + normalizedLevel * 76;
  return Array.from({ length: 28 }, (_, index) => {
    const phase = Math.sin(index * 0.86) * 0.26 + Math.cos(index * 0.43) * 0.18;
    return Math.max(6, Math.min(94, baseHeight * (0.72 + phase)));
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

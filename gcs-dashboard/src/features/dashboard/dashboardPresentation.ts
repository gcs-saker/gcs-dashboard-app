import type { RealtimePlayerSnapshot } from "../streaming/types";
import {
  getDashboardStreamDisplayName,
  getDashboardStreamStatusText,
  type DashboardGeometrySource,
  type DashboardStreamSlot,
} from "./streamTypes";

export type TelemetryRow = readonly [label: string, value: string];
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

abstract class StreamTelemetryRowsBuilder {
  build(stream: DashboardStreamSlot): TelemetryRow[] {
    const geometry = stream.geometry;
    const baseRows = this.buildBaseRows(stream);
    if (!geometry) {
      return [...baseRows, ...this.buildWaitingRows()];
    }
    return [...baseRows, ...this.buildGeometryRows(geometry)];
  }

  protected buildBaseRows(stream: DashboardStreamSlot): TelemetryRow[] {
    return [
      ["스트림", getDashboardStreamDisplayName(stream)],
      ["상태", getDashboardStreamStatusText(stream.status)],
    ];
  }

  protected buildWaitingRows(): TelemetryRow[] {
    return [
      ["좌표", "대기"],
      ["고도", "대기"],
      ["방위", "대기"],
      ["좌표소스", "없음"],
    ];
  }

  protected abstract buildGeometryRows(geometry: NonNullable<DashboardStreamSlot["geometry"]>): TelemetryRow[];
}

class DashboardTelemetryRowsBuilder extends StreamTelemetryRowsBuilder {
  protected buildGeometryRows(geometry: NonNullable<DashboardStreamSlot["geometry"]>): TelemetryRow[] {
    return [
      ["위도", geometry.lat.toFixed(6)],
      ["경도", geometry.lng.toFixed(6)],
      ["고도", `${geometry.altitudeM.toFixed(1)} m`],
      ["기체 방위", formatBearing(geometry.headingDeg)],
      ["지도 기준", formatBearing(geometry.yawDeg)],
      ["방위 차이", formatBearingDelta(geometry.headingDeg, geometry.yawDeg)],
      ["피치 / 롤", `${formatSignedDegree(geometry.pitchDeg)} / ${formatSignedDegree(geometry.rollDeg)}`],
      ["FOV", `${geometry.fovDeg}deg`],
      ["좌표소스", geometrySourceLabel(geometry.source)],
    ];
  }
}

const telemetryRowsBuilder = new DashboardTelemetryRowsBuilder();
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
}

export interface StatusNote {
  label: string;
  tone: StatusTone;
}

export interface StatusTile extends StatusNote {
  value: string;
}

export function geometrySourceLabel(source: DashboardGeometrySource | undefined): string {
  switch (source) {
    case "telemetry":
      return "GPS 텔레메트리";
    case "registry":
      return "장비 등록값";
    case "device":
      return "장비 좌표";
    case "mock":
    default:
      return "기본 좌표";
  }
}

export function telemetryRowsForStream(stream: DashboardStreamSlot): TelemetryRow[] {
  return telemetryRowsBuilder.build(stream);
}

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function formatBearing(value: number): string {
  return `${Math.round(normalizeDegrees(value)).toString().padStart(3, "0")}deg`;
}

export function formatSignedDegree(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}deg`;
}

export function formatBearingDelta(headingDeg: number, mapBearingDeg: number): string {
  const delta = ((headingDeg - mapBearingDeg + 540) % 360) - 180;
  return formatSignedDegree(delta);
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

export function formatPlaybackMode(mode: RealtimePlayerSnapshot["mode"] | null, streamStatus: DashboardStreamSlot["status"]): string {
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

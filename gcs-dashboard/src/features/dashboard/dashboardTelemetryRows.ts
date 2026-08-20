import {
  getDashboardStreamDisplayName,
  getDashboardStreamStatusText,
  type DashboardGeometrySource,
  type DashboardStreamSlot,
} from "./streamTypes";

export type TelemetryRow = readonly [label: string, value: string];

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
      ["기체 방위", formatCompassBearing(geometry.headingDeg)],
      ["지도 기준", formatBearing(geometry.yawDeg)],
      ["방위 차이", formatBearingDelta(geometry.headingDeg, geometry.yawDeg)],
      ["피치 / 롤", `${formatSignedDegree(geometry.pitchDeg)} / ${formatSignedDegree(geometry.rollDeg)}`],
      ["속도", formatSpeed(geometry.speedMps)],
      ["FOV", `${geometry.fovDeg}deg`],
      ["좌표소스", geometrySourceLabel(geometry.source)],
    ];
  }
}

const telemetryRowsBuilder = new DashboardTelemetryRowsBuilder();

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

export function formatCompassBearing(value: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
  const normalized = normalizeDegrees(value);
  const direction = directions[Math.round(normalized / 45) % directions.length];
  return `${formatBearing(normalized)} (${direction})`;
}

export function formatSignedDegree(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}deg`;
}

export function formatSpeed(speedMps: number | undefined): string {
  return speedMps === undefined ? "--" : `${(speedMps * 3.6).toFixed(1)} km/h`;
}

export function formatBearingDelta(headingDeg: number, mapBearingDeg: number): string {
  const delta = ((headingDeg - mapBearingDeg + 540) % 360) - 180;
  return formatSignedDegree(delta);
}

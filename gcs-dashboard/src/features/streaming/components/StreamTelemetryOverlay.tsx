import type { StreamGeometry } from "@streaming/streamModel";
import "./StreamTelemetryOverlay.css";

interface StreamTelemetryOverlayProps {
  readonly geometry?: StreamGeometry | null;
}

function formatCoordinate(value: number): string {
  return value.toFixed(5);
}

function formatAngle(value: number): string {
  return `${value.toFixed(1)}°`;
}

export function StreamTelemetryOverlay({ geometry }: StreamTelemetryOverlayProps) {
  if (!geometry || (geometry.source !== "telemetry" && geometry.source !== "device")) return null;

  return (
    <dl className="stream-telemetry-overlay" aria-label="스트림 텔레메트리">
      <div className="stream-telemetry-overlay__position">
        <dt>좌표</dt><dd>{formatCoordinate(geometry.lat)}, {formatCoordinate(geometry.lng)}</dd>
      </div>
      <div><dt>고도</dt><dd>{geometry.altitudeM.toFixed(1)} m</dd></div>
      <div><dt>방위</dt><dd>{Math.round(geometry.headingDeg)}°</dd></div>
      {geometry.batteryPercent == null ? null : (
        <div><dt>배터리</dt><dd>{Math.round(geometry.batteryPercent)}%</dd></div>
      )}
      <div className="stream-telemetry-overlay__attitude">
        <dt>자세</dt>
        <dd>R {formatAngle(geometry.rollDeg)} · P {formatAngle(geometry.pitchDeg)} · Y {formatAngle(geometry.yawDeg)}</dd>
      </div>
    </dl>
  );
}

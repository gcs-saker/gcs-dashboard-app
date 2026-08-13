import type { StreamGeometry } from "@streaming/streamModel";
import "./StreamTelemetryOverlay.css";

interface StreamTelemetryOverlayProps {
  readonly geometry?: StreamGeometry | null;
}

function formatCoordinate(value: number): string {
  return value.toFixed(5);
}

export function StreamTelemetryOverlay({ geometry }: StreamTelemetryOverlayProps) {
  if (!geometry) return null;

  return (
    <dl className="stream-telemetry-overlay" aria-label="스트림 텔레메트리">
      <div><dt>위도</dt><dd>{formatCoordinate(geometry.lat)}</dd></div>
      <div><dt>경도</dt><dd>{formatCoordinate(geometry.lng)}</dd></div>
      <div><dt>고도</dt><dd>{geometry.altitudeM.toFixed(1)} m</dd></div>
      <div><dt>방위</dt><dd>{Math.round(geometry.headingDeg)}°</dd></div>
      {geometry.batteryPercent == null ? null : (
        <div><dt>배터리</dt><dd>{Math.round(geometry.batteryPercent)}%</dd></div>
      )}
    </dl>
  );
}

import type { ReactNode } from "react";
import type { DashboardWidgetDefinition } from "@dashboard/layout/dashboardLayout";
import {
  getDashboardStreamDisplayName,
  getDashboardStreamStatusText,
  type DashboardStreamSlot,
} from "@dashboard/streaming/streamTypes";
import {
  formatBearing,
  formatBearingDelta,
  normalizeDegrees,
  type TelemetryRow,
} from "@dashboard/layout/dashboardPresentation";

interface TelemetryPanelProps {
  controls: ReactNode;
  isPinned: boolean;
  rows: TelemetryRow[];
  stream: DashboardStreamSlot;
  widget: DashboardWidgetDefinition;
}

export function TelemetryPanel({
  controls,
  isPinned,
  rows,
  stream,
  widget,
}: TelemetryPanelProps) {
  const geometry = stream.geometry;
  const streamName = getDashboardStreamDisplayName(stream);
  const heading = geometry ? formatBearing(geometry.headingDeg) : "대기";
  const mapBearing = geometry ? formatBearing(geometry.yawDeg) : "대기";
  const bearingDelta = geometry ? formatBearingDelta(geometry.headingDeg, geometry.yawDeg) : "대기";
  const headingRotation = geometry ? `rotate(${normalizeDegrees(geometry.headingDeg)}deg)` : undefined;
  const mapRotation = geometry ? `rotate(${normalizeDegrees(geometry.yawDeg)}deg)` : undefined;
  const primaryMetrics: TelemetryRow[] = [
    ["고도", geometry ? `${geometry.altitudeM.toFixed(1)} m` : "대기"],
    ["기체 방위", heading],
    ["지도 기준", mapBearing],
  ];

  return (
    <section
      aria-labelledby="telemetry-title"
      className={`ops-panel telemetry-panel ${isPinned ? "is-pinned" : ""}`}
      data-widget-id={widget.id}
      style={{ minHeight: widget.minHeight, minWidth: widget.minWidth }}
    >
      <div className="ops-panel__header">
        <h2 id="telemetry-title">지오메트리 / 텔레메트리</h2>
        {controls}
      </div>
      <TelemetryBody
        bearingDelta={bearingDelta}
        heading={heading}
        headingRotation={headingRotation}
        mapBearing={mapBearing}
        mapRotation={mapRotation}
        primaryMetrics={primaryMetrics}
        rows={rows}
        stream={stream}
        streamName={streamName}
      />
    </section>
  );
}

interface TelemetryBodyProps {
  bearingDelta: string;
  heading: string;
  headingRotation?: string;
  mapBearing: string;
  mapRotation?: string;
  primaryMetrics: TelemetryRow[];
  rows: TelemetryRow[];
  stream: DashboardStreamSlot;
  streamName: string;
}

function TelemetryBody(props: TelemetryBodyProps) {
  return (
    <div className="telemetry-panel__body">
        <div className="telemetry-panel__identity">
          <span>선택 스트림</span>
          <strong>{props.streamName}</strong>
          <em className={`ops-summary__state is-${props.stream.status}`}>{getDashboardStreamStatusText(props.stream.status)}</em>
        </div>
        <div className="telemetry-compass" aria-label="기체 방위와 지도 기준 방위">
          <div className="telemetry-compass__dial">
            <span className="telemetry-compass__north">N</span>
            <span className="telemetry-compass__needle" style={{ transform: props.headingRotation }} />
            <span className="telemetry-compass__map-bearing" style={{ transform: props.mapRotation }} />
          </div>
          <div className="telemetry-compass__legend">
            <span>기체 {props.heading}</span>
            <span>지도 {props.mapBearing}</span>
            <strong>차이 {props.bearingDelta}</strong>
          </div>
        </div>
        <dl className="telemetry-panel__metrics">
          {props.primaryMetrics.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <dl className="telemetry-panel__details">
          {props.rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
    </div>
  );
}

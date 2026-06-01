import { useMemo, useState } from "react";
import type { DashboardStreamSlot } from "../streamTypes";

interface TacticalLeafletMapProps {
  selectedStream: DashboardStreamSlot;
  streams: DashboardStreamSlot[];
}

interface ProjectedStream {
  stream: DashboardStreamSlot;
  left: number;
  top: number;
}

const DEFAULT_CENTER = { lat: 35.871435, lng: 128.601445 };
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const INITIAL_ZOOM = 3;

function coordinateSourceLabel(stream: DashboardStreamSlot): string {
  switch (stream.geometry?.source) {
    case "telemetry":
      return "실시간 GPS";
    case "device":
      return "장비 좌표";
    case "registry":
      return "등록 좌표";
    case "mock":
    case undefined:
      return "내장 오프라인 지도";
  }
}

function clampPercent(value: number): number {
  return Math.min(92, Math.max(8, value));
}

function projectStreams(streams: DashboardStreamSlot[], selectedStream: DashboardStreamSlot, zoom: number): ProjectedStream[] {
  const geometricStreams = streams.filter((stream) => stream.geometry);
  const center = selectedStream.geometry ?? DEFAULT_CENTER;
  const spread = Math.max(0.008 / zoom, 0.0016);

  return geometricStreams.map((stream) => {
    const geometry = stream.geometry ?? center;
    return {
      stream,
      left: clampPercent(50 + ((geometry.lng - center.lng) / spread) * 42),
      top: clampPercent(50 - ((geometry.lat - center.lat) / spread) * 42),
    };
  });
}

function markerClassForStream(stream: DashboardStreamSlot, selectedStream: DashboardStreamSlot): string {
  const classes = ["offline-map-marker"];
  if (stream.id === selectedStream.id) classes.push("is-selected");
  if (stream.status === "fallback" || stream.status === "degraded") classes.push("is-warning");
  if (stream.status === "offline") classes.push("is-offline");
  return classes.join(" ");
}

function coordinateText(stream: DashboardStreamSlot): string {
  if (!stream.geometry) return "좌표 대기 중";
  return `${stream.geometry.lat.toFixed(6)}, ${stream.geometry.lng.toFixed(6)}`;
}

export function TacticalLeafletMap({ selectedStream, streams }: TacticalLeafletMapProps) {
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const projectedStreams = useMemo(() => projectStreams(streams, selectedStream, zoom), [selectedStream, streams, zoom]);
  const selectedGeometry = selectedStream.geometry ?? DEFAULT_CENTER;

  return (
    <div
      className="tactical-map__canvas tactical-map__canvas--offline"
      data-testid="offline-tactical-map"
      aria-label="폐쇄망 오프라인 전술 지도"
    >
      <div className="offline-map-grid" aria-hidden="true" />
      <div className="offline-map-roads" aria-hidden="true" />
      <div className="offline-map-river" aria-hidden="true" />
      <span className="map-coordinate-source" data-testid="map-coordinate-source">
        {coordinateSourceLabel(selectedStream)}
      </span>
      <span className="offline-map-center" data-testid="offline-map-center">
        중심 {selectedGeometry.lat.toFixed(6)}, {selectedGeometry.lng.toFixed(6)}
      </span>
      <div className="map-toolbar" aria-label="지도 도구">
        <button aria-label="지도 중심 초기화" type="button" onClick={() => setZoom(INITIAL_ZOOM)}>
          ⌖
        </button>
        <button aria-label="지도 확대" type="button" onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + 1))}>
          +
        </button>
        <button aria-label="지도 축소" type="button" onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - 1))}>
          -
        </button>
      </div>
      {projectedStreams.map(({ stream, left, top }) => (
        <button
          key={stream.id}
          className={markerClassForStream(stream, selectedStream)}
          style={{ left: `${left}%`, top: `${top}%` }}
          type="button"
          title={`${stream.title} / ${coordinateText(stream)}`}
          aria-label={`${stream.title} 위치 ${coordinateText(stream)}`}
        >
          <span className="offline-map-marker__dot" />
          <span className="offline-map-marker__label">{stream.title}</span>
        </button>
      ))}
    </div>
  );
}

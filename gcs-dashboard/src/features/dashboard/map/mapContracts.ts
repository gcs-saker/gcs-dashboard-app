import type { DashboardStreamSlot } from "../streamTypes";

interface ProjectedStream {
  stream: DashboardStreamSlot;
  left: number;
  top: number;
}

export const DEFAULT_MAP_CENTER = { lat: 35.871435, lng: 128.601445 } as const;
export const INITIAL_MAP_ZOOM = 3;

export function coordinateSourceLabel(stream: DashboardStreamSlot): string {
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

export function projectStreams(streams: DashboardStreamSlot[], selectedStream: DashboardStreamSlot, zoom: number): ProjectedStream[] {
  const geometricStreams = streams.filter((stream) => stream.geometry);
  const center = selectedStream.geometry ?? DEFAULT_MAP_CENTER;
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

export function markerClassForStream(stream: DashboardStreamSlot, selectedStream: DashboardStreamSlot): string {
  const classes = ["offline-map-marker"];
  if (stream.id === selectedStream.id) classes.push("is-selected");
  if (stream.status === "fallback" || stream.status === "degraded") classes.push("is-warning");
  if (stream.status === "offline") classes.push("is-offline");
  return classes.join(" ");
}

export function coordinateText(stream: DashboardStreamSlot): string {
  if (!stream.geometry) return "좌표 대기 중";
  return `${stream.geometry.lat.toFixed(6)}, ${stream.geometry.lng.toFixed(6)}`;
}

function clampPercent(value: number): number {
  return Math.min(92, Math.max(8, value));
}

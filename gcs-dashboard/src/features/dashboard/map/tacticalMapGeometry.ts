export interface MapCoordinate {
  lat: number;
  lng: number;
}

export interface MapPoint {
  left: number;
  top: number;
}

const MIN_MARKER_PERCENT = 8;
const MAX_MARKER_PERCENT = 92;

export function clampMapPercent(value: number): number {
  return Math.min(MAX_MARKER_PERCENT, Math.max(MIN_MARKER_PERCENT, value));
}

export function mapSpreadForZoom(zoom: number): number {
  return Math.max(0.008 / zoom, 0.0016);
}

export function projectCoordinate(coordinate: MapCoordinate, center: MapCoordinate, zoom: number): MapPoint {
  const spread = mapSpreadForZoom(zoom);
  return {
    left: clampMapPercent(50 + ((coordinate.lng - center.lng) / spread) * 42),
    top: clampMapPercent(50 - ((coordinate.lat - center.lat) / spread) * 42),
  };
}

export function coordinateFromMapPercent(point: MapPoint, center: MapCoordinate, zoom: number): MapCoordinate {
  const spread = mapSpreadForZoom(zoom);
  return {
    lat: center.lat - ((point.top - 50) / 42) * spread,
    lng: center.lng + ((point.left - 50) / 42) * spread,
  };
}

export function formatCoordinate(coordinate: MapCoordinate): string {
  return `${coordinate.lat.toFixed(6)}, ${coordinate.lng.toFixed(6)}`;
}

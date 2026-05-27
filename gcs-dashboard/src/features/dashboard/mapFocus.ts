import type { DashboardStreamSlot } from "./streamTypes";

export interface MapFocusViewModel {
  label: string;
  hasGeometry: boolean;
  markerStyle: {
    left: string;
    top: string;
  };
  coneStyle: {
    transform: string;
  };
}

const DEFAULT_MARKER_STYLE = { left: "50%", top: "50%" };

export function getMapFocusForStream(stream: DashboardStreamSlot): MapFocusViewModel {
  if (!stream.geometry) {
    return {
      label: `${stream.title} focus 대기`,
      hasGeometry: false,
      markerStyle: DEFAULT_MARKER_STYLE,
      coneStyle: { transform: "rotate(0deg)" },
    };
  }

  const lngOffset = (stream.geometry.lng - 127.118) * 180;
  const latOffset = (37.127 - stream.geometry.lat) * 180;
  const left = Math.min(82, Math.max(14, 42 + lngOffset));
  const top = Math.min(76, Math.max(14, 32 + latOffset));

  return {
    label: `${stream.title} focus ${stream.geometry.headingDeg}deg / FOV ${stream.geometry.fovDeg}deg`,
    hasGeometry: true,
    markerStyle: {
      left: `${left.toFixed(1)}%`,
      top: `${top.toFixed(1)}%`,
    },
    coneStyle: {
      transform: `rotate(${stream.geometry.headingDeg}deg)`,
    },
  };
}

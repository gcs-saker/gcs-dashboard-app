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
const DAEGU_CENTER = {
  lat: 35.871435,
  lng: 128.601445,
};

function sourceLabel(stream: DashboardStreamSlot): string {
  switch (stream.geometry?.source) {
    case "telemetry":
      return "실시간 GPS";
    case "device":
      return "장비 좌표";
    case "registry":
      return "등록 좌표";
    case "mock":
    case undefined:
      return "기본 좌표";
  }
}

export function getMapFocusForStream(stream: DashboardStreamSlot): MapFocusViewModel {
  if (!stream.geometry) {
    return {
      label: `${stream.title} focus 대기`,
      hasGeometry: false,
      markerStyle: DEFAULT_MARKER_STYLE,
      coneStyle: { transform: "rotate(0deg)" },
    };
  }

  const lngOffset = (stream.geometry.lng - DAEGU_CENTER.lng) * 180;
  const latOffset = (DAEGU_CENTER.lat - stream.geometry.lat) * 180;
  const left = Math.min(82, Math.max(14, 42 + lngOffset));
  const top = Math.min(76, Math.max(14, 32 + latOffset));

  return {
    label: `${stream.title} ${sourceLabel(stream)} ${stream.geometry.headingDeg}deg / FOV ${stream.geometry.fovDeg}deg`,
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

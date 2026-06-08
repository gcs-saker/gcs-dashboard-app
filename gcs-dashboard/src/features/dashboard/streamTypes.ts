import type { ReactNode } from "react";

import {
  DASHBOARD_GEOMETRY_SOURCE,
  DASHBOARD_STREAM_MODE,
  DASHBOARD_STREAM_STATUS,
  type DashboardGeometrySource,
  type DashboardStreamMode,
  type DashboardStreamStatus,
} from "@/features/stateContracts";

export type { DashboardGeometrySource, DashboardStreamMode, DashboardStreamStatus };

export interface DashboardStreamGeometry {
  lat: number;
  lng: number;
  altitudeM: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  yawDeg: number;
  fovDeg: number;
  source?: DashboardGeometrySource;
}

export interface DashboardStreamSlot {
  id: string;
  title: string;
  status: DashboardStreamStatus;
  mode: DashboardStreamMode;
  detail: string;
  aiModeEnabled?: boolean;
  connectedDeviceId?: string | null;
  streamPath?: string | null;
  geometry?: DashboardStreamGeometry | null;
}

export interface StreamWidgetDefinition {
  id: string;
  title: string;
  minWidth: number;
  minHeight: number;
  renderLabel: ReactNode;
}

export const DEFAULT_DASHBOARD_STREAMS: DashboardStreamSlot[] = [
  {
    id: "raw.sample.front",
    title: "스트리밍 1",
    status: DASHBOARD_STREAM_STATUS.online,
    mode: DASHBOARD_STREAM_MODE.eo,
    detail: "전방 EO / raw.sample.front",
    connectedDeviceId: "device-drn-01-front",
    streamPath: "raw.sample.front",
    geometry: {
      lat: 35.871435,
      lng: 128.601445,
      altitudeM: 120,
      headingDeg: 130,
      pitchDeg: -2.1,
      rollDeg: 1.3,
      yawDeg: 127,
      fovDeg: 72,
      source: DASHBOARD_GEOMETRY_SOURCE.mock,
    },
  },
  {
    id: "raw.sample.thermal",
    title: "스트리밍 2",
    status: DASHBOARD_STREAM_STATUS.fallback,
    mode: DASHBOARD_STREAM_MODE.ir,
    detail: "열화상 fallback / raw.sample.thermal",
    connectedDeviceId: "device-drn-02-thermal",
    streamPath: "raw.sample.thermal",
    geometry: {
      lat: 35.8781,
      lng: 128.5948,
      altitudeM: 96,
      headingDeg: 178,
      pitchDeg: -8,
      rollDeg: 0.5,
      yawDeg: 176,
      fovDeg: 58,
      source: DASHBOARD_GEOMETRY_SOURCE.mock,
    },
  },
  {
    id: "raw.sample.rear",
    title: "스트리밍 3",
    status: DASHBOARD_STREAM_STATUS.online,
    mode: DASHBOARD_STREAM_MODE.ai,
    detail: "AI 감지 overlay / raw.sample.rear",
    connectedDeviceId: "device-ugv-01-rear",
    streamPath: "raw.sample.rear",
    geometry: {
      lat: 35.8669,
      lng: 128.5931,
      altitudeM: 18,
      headingDeg: 84,
      pitchDeg: 0,
      rollDeg: 0,
      yawDeg: 84,
      fovDeg: 82,
      source: DASHBOARD_GEOMETRY_SOURCE.mock,
    },
  },
  {
    id: "raw.local.webcam",
    title: "스트리밍 4",
    status: DASHBOARD_STREAM_STATUS.offline,
    mode: DASHBOARD_STREAM_MODE.map,
    detail: "로컬 웹캠 대기 / raw.local.webcam",
    connectedDeviceId: "device-local-webcam",
    streamPath: "raw.local.webcam",
    geometry: {
      lat: 35.8724,
      lng: 128.6072,
      altitudeM: 12,
      headingDeg: 24,
      pitchDeg: 0,
      rollDeg: 0,
      yawDeg: 24,
      fovDeg: 64,
      source: DASHBOARD_GEOMETRY_SOURCE.mock,
    },
  },
];

export const STREAM_GRID_WIDGET: StreamWidgetDefinition = {
  id: "stream-grid",
  title: "다중 스트림",
  minWidth: 360,
  minHeight: 220,
  renderLabel: "다중 스트림",
};

export const SELECTED_STREAM_WIDGET: StreamWidgetDefinition = {
  id: "selected-stream",
  title: "선택 스트림",
  minWidth: 360,
  minHeight: 300,
  renderLabel: "선택 스트림",
};

export function getDashboardStreamStatusText(status: DashboardStreamStatus): string {
  switch (status) {
    case DASHBOARD_STREAM_STATUS.online:
      return "정상";
    case DASHBOARD_STREAM_STATUS.fallback:
      return "Fallback";
    case DASHBOARD_STREAM_STATUS.offline:
      return "오프라인";
    case DASHBOARD_STREAM_STATUS.error:
      return "오류";
    case DASHBOARD_STREAM_STATUS.reconnecting:
      return "재연결";
    case DASHBOARD_STREAM_STATUS.degraded:
      return "저하";
  }
}

export function getDashboardStreamStatusClass(status: DashboardStreamStatus): string {
  return `is-${status}`;
}

export function getDashboardStreamDisplayName(stream: Pick<DashboardStreamSlot, "detail" | "streamPath" | "title">): string {
  const [label] = stream.detail.split(" / ");
  const trimmed = label.trim();
  if (trimmed && trimmed !== stream.streamPath) return trimmed;
  return stream.title;
}

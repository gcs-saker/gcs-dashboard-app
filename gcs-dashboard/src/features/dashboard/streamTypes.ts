import type { ReactNode } from "react";

import {
  DASHBOARD_STREAM_MODE,
  DASHBOARD_STREAM_STATUS,
  type DashboardGeometrySource,
  type DashboardStreamMode,
  type DashboardStreamStatus,
} from "@/features/stateContracts";

export type { DashboardGeometrySource, DashboardStreamMode, DashboardStreamStatus };
export {
  CCTV_EMPTY_STREAM_ID_PREFIX,
  createEmptyCctvStreamSlot,
  DEFAULT_DASHBOARD_STREAMS,
} from "./dashboardDefaultStreams";

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
  sourceUrl?: string | null;
  geometry?: DashboardStreamGeometry | null;
}

export interface StreamWidgetDefinition {
  id: string;
  title: string;
  minWidth: number;
  minHeight: number;
  renderLabel: ReactNode;
}

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

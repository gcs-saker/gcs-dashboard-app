import type { ReactNode } from "react";

export type DashboardStreamStatus =
  | "online"
  | "fallback"
  | "offline"
  | "error"
  | "reconnecting"
  | "degraded";

export type DashboardStreamMode = "EO" | "IR" | "AI" | "MAP";

export interface DashboardStreamSlot {
  id: string;
  title: string;
  status: DashboardStreamStatus;
  mode: DashboardStreamMode;
  detail: string;
  connectedDeviceId?: string | null;
  streamPath?: string | null;
  geometry?: {
    lat: number;
    lng: number;
    altitudeM: number;
    headingDeg: number;
    pitchDeg: number;
    rollDeg: number;
    yawDeg: number;
    fovDeg: number;
  } | null;
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
    status: "online",
    mode: "EO",
    detail: "전방 EO / raw.sample.front",
  },
  {
    id: "raw.sample.thermal",
    title: "스트리밍 2",
    status: "fallback",
    mode: "IR",
    detail: "열화상 fallback / raw.sample.thermal",
  },
  {
    id: "raw.sample.rear",
    title: "스트리밍 3",
    status: "online",
    mode: "AI",
    detail: "AI 감지 overlay / raw.sample.rear",
  },
  {
    id: "raw.local.webcam",
    title: "스트리밍 4",
    status: "offline",
    mode: "MAP",
    detail: "로컬 웹캠 대기 / raw.local.webcam",
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
    case "online":
      return "정상";
    case "fallback":
      return "Fallback";
    case "offline":
      return "오프라인";
    case "error":
      return "오류";
    case "reconnecting":
      return "재연결";
    case "degraded":
      return "저하";
  }
}

export function getDashboardStreamStatusClass(status: DashboardStreamStatus): string {
  return `is-${status}`;
}

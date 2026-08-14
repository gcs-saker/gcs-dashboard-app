import { DASHBOARD_STREAM_STATUS, type DashboardStreamStatus } from "@/features/stateContracts";
import type { StreamSlot } from "@streaming/layout/streamModel";

export function getStreamStatusText(status: DashboardStreamStatus): string {
  switch (status) {
    case DASHBOARD_STREAM_STATUS.online: return "정상";
    case DASHBOARD_STREAM_STATUS.fallback: return "Fallback";
    case DASHBOARD_STREAM_STATUS.offline: return "오프라인";
    case DASHBOARD_STREAM_STATUS.error: return "오류";
    case DASHBOARD_STREAM_STATUS.reconnecting: return "재연결";
    case DASHBOARD_STREAM_STATUS.degraded: return "저하";
  }
}

export function getStreamStatusClass(status: DashboardStreamStatus): string {
  return `is-${status}`;
}

export function getStreamDisplayName(stream: Pick<StreamSlot, "detail" | "streamPath" | "title">): string {
  const [label] = stream.detail.split(" / ");
  const trimmed = label.trim();
  if (trimmed && trimmed !== stream.streamPath) return trimmed;
  return stream.title;
}

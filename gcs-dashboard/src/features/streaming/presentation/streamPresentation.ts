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
  if (isPublicStreamLabel(trimmed) && trimmed !== stream.streamPath) return trimmed;
  return stream.title;
}

export function getStreamSecondaryLabel(stream: Pick<StreamSlot, "detail" | "streamPath" | "title">): string | null {
  const displayName = getStreamDisplayName(stream);
  return displayName === stream.title ? null : displayName;
}

export function isPublicStreamLabel(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return !PRIVATE_STREAM_LABEL_PATTERNS.some((pattern) => pattern.test(normalized));
}

const PRIVATE_STREAM_LABEL_PATTERNS = [
  /^(?:raw|archive|live|talkback)[./]/,
  /(?:^|[._/-])pub_[a-z0-9_-]+/,
  /webrtcsession|rtspSession|hlsmuxer/i,
  /\breaders?\s*\d+/,
  /^(?:https?|rtsp|rtmp|srt|whep|whip):/,
];

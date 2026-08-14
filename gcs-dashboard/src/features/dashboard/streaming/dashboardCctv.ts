import { DASHBOARD_STREAM_STATUS } from "@features/stateContracts";
import {
  CCTV_EMPTY_STREAM_ID_PREFIX,
  createEmptyCctvStreamSlot,
  type DashboardStreamSlot,
} from "@dashboard/streaming/streamTypes";
import type { CctvLayoutMode } from "@dashboard/preferences/userPreferences";

export function getCctvGridSize(mode: CctvLayoutMode): number {
  if (mode === "3x3") return 3;
  if (mode === "5x5") return 5;
  return 4;
}

export function buildCctvGridStreams(streams: DashboardStreamSlot[], gridSize: number): DashboardStreamSlot[] {
  const positionedCctvStreams = new Map<number, DashboardStreamSlot>();
  const regularStreams: DashboardStreamSlot[] = [];

  for (const stream of streams) {
    const cctvChannelNumber = parseCctvChannelNumber(stream.id);
    if (cctvChannelNumber) {
      positionedCctvStreams.set(cctvChannelNumber, stream);
      continue;
    }
    regularStreams.push(stream);
  }

  return Array.from({ length: gridSize * gridSize }, (_, index) => {
    const channelNumber = index + 1;
    return positionedCctvStreams.get(channelNumber) ?? regularStreams[index] ?? createEmptyCctvStreamSlot(channelNumber);
  });
}

export function isReceivableStream(
  stream: DashboardStreamSlot,
): stream is DashboardStreamSlot & { streamPath: string } {
  if (stream.id.startsWith(CCTV_EMPTY_STREAM_ID_PREFIX)) return false;
  return (
    Boolean(stream.streamPath) &&
    (stream.status === DASHBOARD_STREAM_STATUS.online ||
      stream.status === DASHBOARD_STREAM_STATUS.fallback ||
      stream.status === DASHBOARD_STREAM_STATUS.degraded ||
      stream.status === DASHBOARD_STREAM_STATUS.reconnecting)
  );
}

export interface CctvStatusSummary {
  fallback: number;
  offline: number;
  online: number;
}

export function summarizeCctvStatus(streams: readonly DashboardStreamSlot[]): CctvStatusSummary {
  return streams.reduce<CctvStatusSummary>(
    (summary, stream) => {
      if (stream.status === DASHBOARD_STREAM_STATUS.online) {
        return { ...summary, online: summary.online + 1 };
      }
      if (stream.status === DASHBOARD_STREAM_STATUS.fallback) {
        return { ...summary, fallback: summary.fallback + 1 };
      }
      if (stream.status === DASHBOARD_STREAM_STATUS.offline) {
        return { ...summary, offline: summary.offline + 1 };
      }
      return summary;
    },
    { fallback: 0, offline: 0, online: 0 },
  );
}

function parseCctvChannelNumber(streamId: string): number | null {
  if (!streamId.startsWith(CCTV_EMPTY_STREAM_ID_PREFIX)) return null;
  const channelNumber = Number(streamId.replace(CCTV_EMPTY_STREAM_ID_PREFIX, ""));
  return Number.isInteger(channelNumber) && channelNumber > 0 ? channelNumber : null;
}

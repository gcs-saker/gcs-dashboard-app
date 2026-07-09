import type { TimeSyncStatus } from "@dashboard/timeSync";

interface TimeSyncMetricsProps {
  browserOffsetMs: number;
  lastUpdatedAt: number | null;
  status: TimeSyncStatus | null;
}

export function TimeSyncMetrics({ browserOffsetMs, lastUpdatedAt, status }: TimeSyncMetricsProps) {
  return (
    <div className="time-sync-view__metrics" aria-label="시간 상태">
      <span><strong>서버시각</strong>{status ? new Date(status.serverTime).toLocaleString("ko-KR") : "-"}</span>
      <span><strong>브라우저차이</strong>{status ? `${Math.round(browserOffsetMs)} ms` : "-"}</span>
      <span><strong>시간소스</strong>{status?.sourceHost ? `${status.sourceHost}:${status.sourcePort}` : "없음"}</span>
      <span><strong>기준</strong>{status ? `${status.timezone} / ${status.monotonicMs} ms` : "-"}</span>
      <span><strong>갱신</strong>{lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString("ko-KR") : "-"}</span>
    </div>
  );
}

import type { TimeSyncStatus } from "@dashboard/operations/timeSync";

interface TimeSyncMetricsProps {
  browserOffsetMs: number;
  status: TimeSyncStatus | null;
}

export function TimeSyncMetrics({ browserOffsetMs, status }: TimeSyncMetricsProps) {
  const browserTime = status ? Date.parse(status.serverTime) + browserOffsetMs : null;
  const drifted = status ? Math.abs(browserOffsetMs) > status.driftWarnMs : false;
  return (
    <div className="time-sync-view__metrics" aria-label="시간 상태">
      <Metric label="서버 시각" value={status ? formatDateTime(status.serverTime) : "-"} detail={status?.timezone} />
      <Metric label="브라우저 시각" value={browserTime === null ? "-" : formatDateTime(browserTime)} detail="현재 브라우저 기준" />
      <Metric className={drifted ? "is-warning" : "is-ok"} label="시각 차이"
        value={status ? formatClockOffset(browserOffsetMs) : "-"}
        detail={status ? `${formatMilliseconds(browserOffsetMs)} · 허용 ${status.driftWarnMs.toLocaleString("ko-KR")} ms` : undefined} />
      <Metric label="동기화 소스" value={status?.sourceHost ? `${status.sourceHost}:${status.sourcePort}` : "설정 없음"} detail="NTP endpoint" />
      <Metric label="마지막 점검" value={status ? formatDateTime(status.checkedAt) : "-"}
        detail={status?.health === "ok" ? "정상" : status?.health === "warn" ? "주의" : status ? "오류" : undefined} />
    </div>
  );
}

function Metric({ className = "", detail, label, value }: { className?: string; detail?: string; label: string; value: string }) {
  return <span className={className}><strong>{label}</strong><b>{value}</b>{detail ? <small>{detail}</small> : null}</span>;
}

export function formatClockOffset(offsetMs: number): string {
  const rounded = Math.round(offsetMs);
  if (Math.abs(rounded) < 500) return "거의 일치";
  return `브라우저 ${Math.abs(rounded / 1000).toFixed(1)}초 ${rounded > 0 ? "빠름" : "느림"}`;
}

const formatDateTime = (value: string | number): string => new Date(value).toLocaleString("ko-KR");
const formatMilliseconds = (value: number): string => `${Math.round(value).toLocaleString("ko-KR")} ms`;

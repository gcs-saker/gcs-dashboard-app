import type { TimeSyncStatus } from "@dashboard/operations/timeSync";

interface TimeSyncMetricsProps {
  browserOffsetMs: number;
  status: TimeSyncStatus | null;
}

export function TimeSyncMetrics({ browserOffsetMs, status }: TimeSyncMetricsProps) {
  const browserTime = status ? Date.parse(status.serverTime) + browserOffsetMs : null;
  const drifted = status ? status.clockStatus === "warning" || status.clockStatus === "unsafe" : false;
  return (
    <div className="time-sync-view__metrics" aria-label="시간 상태">
      <Metric label="서버 시각" value={status ? formatDateTime(status.serverTime) : "-"} detail={status?.timezone} />
      <Metric label="브라우저 시각" value={browserTime === null ? "-" : formatDateTime(browserTime)} detail="현재 브라우저 기준" />
      <Metric className={drifted ? "is-warning" : status?.clockStatus === "normal" ? "is-ok" : ""} label="서버 Drift"
        value={status?.clockDriftMs === null || !status ? "측정 불가" : formatMilliseconds(status.clockDriftMs)}
        detail={status ? `${clockStatusLabel(status.clockStatus)} · 허용 ${status.driftWarnMs.toLocaleString("ko-KR")} ms` : undefined} />
      <Metric label="동기화 소스" value={status?.timeSource ?? "설정 없음"} detail="감사 시각 기준" />
      <Metric label="마지막 점검" value={status ? formatDateTime(status.clockMeasuredAt) : "-"}
        detail={status ? clockStatusLabel(status.clockStatus) : undefined} />
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
const clockStatusLabel = (status: TimeSyncStatus["clockStatus"]): string => ({
  normal: "정상", warning: "주의", unsafe: "위험", unknown: "미확인",
})[status];

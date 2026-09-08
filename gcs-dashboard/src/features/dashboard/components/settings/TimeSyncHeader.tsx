import { timeSyncHealthLabel, type TimeSyncStatus } from "@dashboard/operations/timeSync";

interface TimeSyncHeaderProps {
  browserOffsetMs: number;
  status: TimeSyncStatus | null;
}

export function TimeSyncHeader({ browserOffsetMs, status }: TimeSyncHeaderProps) {
  const browserDrifted = status !== null && Math.abs(browserOffsetMs) > status.driftWarnMs;
  const health = browserDrifted ? "warn" : status?.health ?? "warn";
  return (
    <div className="time-sync-view__header">
      <div>
        <h2>운영설정</h2>
        {status ? <p>{status.message}</p> : <p>시간 상태 확인 중</p>}
        {browserDrifted ? <p>브라우저 시간 차이가 경고 기준을 초과했습니다.</p> : null}
      </div>
      <span className={`time-sync-view__health is-${health}`} role="status">
        {status ? timeSyncHealthLabel(health) : "확인 중"}
      </span>
    </div>
  );
}

import { timeSyncHealthLabel, type TimeSyncStatus } from "@dashboard/timeSync";

interface TimeSyncHeaderProps {
  status: TimeSyncStatus | null;
}

export function TimeSyncHeader({ status }: TimeSyncHeaderProps) {
  return (
    <div className="time-sync-view__header">
      <div>
        <h2>운영설정</h2>
        {status ? <p>{status.message}</p> : <p>시간 상태 확인 중</p>}
      </div>
      <span className={`time-sync-view__health is-${status?.health ?? "warn"}`} role="status">
        {status ? timeSyncHealthLabel(status.health) : "확인 중"}
      </span>
    </div>
  );
}

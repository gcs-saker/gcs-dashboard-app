export type TimeSyncMode = "public" | "closed_network" | "manual";
export type TimeSyncHealth = "ok" | "warn" | "error";

export interface TimeSyncStatus {
  mode: TimeSyncMode;
  sourceHost: string | null;
  sourcePort: number;
  driftWarnMs: number;
  updatedAt: string;
  updatedBy: string;
  serverTime: string;
  monotonicMs: number;
  timezone: string;
  checkedAt: string;
  health: TimeSyncHealth;
  message: string;
}

export interface TimeSyncConfigInput {
  mode: TimeSyncMode;
  sourceHost: string;
  sourcePort: number;
  driftWarnMs: number;
}

export function calculateBrowserOffsetMs(status: TimeSyncStatus, browserNowMs = Date.now()): number {
  return browserNowMs - Date.parse(status.serverTime);
}

export function timeSyncModeLabel(mode: TimeSyncMode): string {
  const labels: Record<TimeSyncMode, string> = {
    public: "공개망",
    closed_network: "폐쇄망",
    manual: "수동/격리",
  };
  return labels[mode];
}

export function timeSyncHealthLabel(health: TimeSyncHealth): string {
  const labels: Record<TimeSyncHealth, string> = {
    ok: "정상",
    warn: "주의",
    error: "오류",
  };
  return labels[health];
}

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_SERVER_STATUS,
  fetchDashboardServerStatus,
  serverHealthText,
  type DashboardServerStatusSnapshot,
} from "../serverStatus";

interface SystemStatusPanelProps {
  controls?: ReactNode;
  fetcher?: typeof fetch;
  refreshMs?: number;
}

export function SystemStatusPanel({ controls, fetcher, refreshMs = 5000 }: SystemStatusPanelProps) {
  const [status, setStatus] = useState<DashboardServerStatusSnapshot>(DEFAULT_SERVER_STATUS);

  useEffect(() => {
    let isMounted = true;
    const refresh = async (): Promise<void> => {
      const snapshot = await fetchDashboardServerStatus(fetcher);
      if (isMounted) {
        setStatus(snapshot);
      }
    };

    void refresh();
    const intervalId = globalThis.setInterval(() => void refresh(), refreshMs);

    return () => {
      isMounted = false;
      globalThis.clearInterval(intervalId);
    };
  }, [fetcher, refreshMs]);

  const rows = [
    ["서버상태", serverHealthText(status.server), status.server],
    ["연결 자산", serverHealthText(status.streams), status.streams],
    ["네트워크", status.latencyMs ? `${status.latencyMs} ms` : "측정 대기", status.readiness],
    ["헬스체크", serverHealthText(status.readiness), status.readiness],
  ];
  const checkedText = status.checkedAt
    ? new Date(status.checkedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "대기";

  return (
    <>
      <div className="ops-panel__header">
        <h2 id="status-title">서버상태 / 연결상태 / 헬스체크</h2>
        {controls}
      </div>
      <dl>
        {rows.map(([label, value, rowStatus]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <span className={`status-dot is-${rowStatus}`} />
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="system-status__updated">업데이트 {checkedText}</p>
    </>
  );
}

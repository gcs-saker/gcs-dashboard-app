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
}

export function SystemStatusPanel({ controls, fetcher }: SystemStatusPanelProps) {
  const [status, setStatus] = useState<DashboardServerStatusSnapshot>(DEFAULT_SERVER_STATUS);

  useEffect(() => {
    let isMounted = true;
    void fetchDashboardServerStatus(fetcher).then((snapshot) => {
      if (isMounted) {
        setStatus(snapshot);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [fetcher]);

  const rows = [
    ["서버상태", serverHealthText(status.server), status.server],
    ["연결 자산", serverHealthText(status.streams), status.streams],
    ["네트워크", status.latencyMs ? `${status.latencyMs} ms` : "측정 대기", status.readiness],
    ["헬스체크", serverHealthText(status.readiness), status.readiness],
  ];

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
    </>
  );
}

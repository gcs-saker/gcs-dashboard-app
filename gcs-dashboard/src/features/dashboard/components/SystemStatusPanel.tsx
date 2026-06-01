import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_SERVER_STATUS,
  fetchDashboardServerStatus,
  serverHealthText,
  type DashboardServerStatusSnapshot,
} from "../serverStatus";
import { AuthApiError } from "../../auth/authApi";

interface SystemStatusPanelProps {
  controls?: ReactNode;
  fetcher?: typeof fetch;
  onAuthFailure?: () => void;
  refreshMs?: number;
}

export function SystemStatusPanel({ controls, fetcher, onAuthFailure, refreshMs = 5000 }: SystemStatusPanelProps) {
  const [status, setStatus] = useState<DashboardServerStatusSnapshot>(DEFAULT_SERVER_STATUS);

  useEffect(() => {
    let isMounted = true;
    let intervalId: ReturnType<typeof globalThis.setInterval> | null = null;
    const refresh = async (): Promise<void> => {
      try {
        const snapshot = await fetchDashboardServerStatus(fetcher);
        if (isMounted) {
          setStatus(snapshot);
        }
      } catch (error) {
        if (error instanceof AuthApiError && error.status === 401) {
          if (intervalId) {
            globalThis.clearInterval(intervalId);
          }
          onAuthFailure?.();
        }
      }
    };

    void refresh();
    intervalId = globalThis.setInterval(() => void refresh(), refreshMs);

    return () => {
      isMounted = false;
      if (intervalId) {
        globalThis.clearInterval(intervalId);
      }
    };
  }, [fetcher, onAuthFailure, refreshMs]);

  const rows = [
    ["API 서버", serverHealthText(status.apiServer), status.apiServer],
    ["인증/인가 서버", serverHealthText(status.authServer), status.authServer],
    ["Signaling 서버", serverHealthText(status.signalingServer), status.signalingServer],
    ["스트림 Registry", serverHealthText(status.streams), status.streams],
    ["네트워크 RTT", status.latencyMs ? `${status.latencyMs} ms` : "측정 대기", status.readiness],
    ["통합 헬스체크", serverHealthText(status.readiness), status.readiness],
  ];
  const checkedText = status.checkedAt
    ? new Date(status.checkedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "대기";

  return (
    <>
      <div className="ops-panel__header">
        <h2 id="status-title">서버 상태 상세 / 연결상태 / 헬스체크</h2>
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

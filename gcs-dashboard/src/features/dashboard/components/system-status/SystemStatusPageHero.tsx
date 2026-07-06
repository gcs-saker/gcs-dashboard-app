import { serverHealthText, type DashboardServerStatusSnapshot } from "@dashboard/serverStatus";
import { DASHBOARD_SERVER_HEALTH } from "@/features/stateContracts";

interface SystemStatusPageHeroProps {
  readinessText: string;
  status: DashboardServerStatusSnapshot;
}

export function SystemStatusPageHero({ readinessText, status }: SystemStatusPageHeroProps) {
  return (
    <header className="system-status-page__hero">
      <div>
        <span>Operations Health</span>
        <h2>서버 상태</h2>
        <p>API, 인증, signaling, stream registry의 상태와 장애 영향 범위를 함께 확인합니다.</p>
      </div>
      <span className={`ops-badge ${status.readiness === DASHBOARD_SERVER_HEALTH.online ? "is-online" : "is-warning"}`}>
        전체 {readinessText}
      </span>
    </header>
  );
}

export function SystemStatusAlert({ status }: { status: DashboardServerStatusSnapshot }) {
  if (status.readiness === DASHBOARD_SERVER_HEALTH.online) return null;
  return (
    <section className={`system-status-alert is-${status.readiness}`} role="alert">
      <strong>서버 상태 확인 필요</strong>
      <span>{serverHealthText(status.readiness)} 상태입니다. 인증, signaling, stream registry 영향 범위를 우선 확인하세요.</span>
    </section>
  );
}

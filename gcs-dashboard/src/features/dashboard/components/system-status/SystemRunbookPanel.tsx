import { serverHealthText, type DashboardServerStatusSnapshot } from "@dashboard/serverStatus";
import { DASHBOARD_SERVER_HEALTH } from "@/features/stateContracts";

interface SystemRunbookPanelProps {
  checkedText: string;
  status: DashboardServerStatusSnapshot;
}

export function SystemRunbookPanel({ checkedText, status }: SystemRunbookPanelProps) {
  return (
    <section className="ops-panel system-status-page__panel system-status-page__runbook">
      <div className="ops-panel__header">
        <h2>운영 진단</h2>
        <span className="ops-badge">업데이트 {checkedText}</span>
      </div>
      <dl>
        <div><dt>우선 조치</dt><dd>{status.signalingServer === DASHBOARD_SERVER_HEALTH.online ? "API/Registry 확인" : "Signaling 경로 확인"}</dd></div>
        <div><dt>확인 지점</dt><dd>이벤트로그, 컨테이너 health, 포트 상태</dd></div>
        <div><dt>로그 기준</dt><dd>WARN/ERROR 증가, 401/502, ICE 실패</dd></div>
        <div><dt>후속 조치</dt><dd>{status.readiness === DASHBOARD_SERVER_HEALTH.online ? "정상 추세 유지 확인" : "장애 영향 범위 우선 격리"}</dd></div>
        <div><dt>현재 상태</dt><dd>{serverHealthText(status.readiness)}</dd></div>
      </dl>
    </section>
  );
}

import { useState } from "react";
import { serverHealthText, type DashboardServerStatusSnapshot } from "@dashboard/operations/serverStatus";
import { DASHBOARD_SERVER_HEALTH } from "@/features/stateContracts";
import {
  acknowledgePublishSessionAlert,
  publishSessionRunbook,
  type AlertAcknowledgementState,
} from "@dashboard/operations/publishSessionRunbook";

interface SystemRunbookPanelProps {
  checkedText: string;
  status: DashboardServerStatusSnapshot;
}

export function SystemRunbookPanel({ checkedText, status }: SystemRunbookPanelProps) {
  const sessionRunbook = publishSessionRunbook(status.signalingReason);
  const [acknowledgement, setAcknowledgement] = useState<AlertAcknowledgementState | "error" | null>(null);
  const submit = async (state: AlertAcknowledgementState): Promise<void> => {
    if (!sessionRunbook) return;
    try {
      await acknowledgePublishSessionAlert(sessionRunbook.id, state);
      setAcknowledgement(state);
    } catch {
      setAcknowledgement("error");
    }
  };
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
        {sessionRunbook ? <>
          <div><dt>Runbook</dt><dd>{sessionRunbook.id}</dd></div>
          <div><dt>권장 조치</dt><dd>{sessionRunbook.action}</dd></div>
          <div><dt>금지 사항</dt><dd>{sessionRunbook.caution}</dd></div>
          <div><dt>문서 경로</dt><dd><code>{sessionRunbook.documentPath}</code></dd></div>
          <div><dt>조치 상태</dt><dd className="system-status-page__acknowledgement">
            <button type="button" onClick={() => void submit("acknowledged")}>확인</button>
            <button type="button" onClick={() => void submit("in_progress")}>조치 중</button>
            <button type="button" onClick={() => void submit("resolved")}>종료</button>
            <span role="status">{acknowledgement === "error" ? "기록 실패" : acknowledgement ?? "미확인"}</span>
          </dd></div>
        </> : null}
      </dl>
    </section>
  );
}

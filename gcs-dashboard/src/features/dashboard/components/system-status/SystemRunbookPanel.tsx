import { useEffect, useState } from "react";
import { serverHealthText, type DashboardServerStatusSnapshot } from "@dashboard/operations/serverStatus";
import { DASHBOARD_SERVER_HEALTH } from "@/features/stateContracts";
import {
  acknowledgePublishSessionAlert,
  fetchPublishSessionAcknowledgements,
  publishSessionRunbook,
  publishSessionRunbookById,
  type AlertAcknowledgementState,
} from "@dashboard/operations/publishSessionRunbook";

interface SystemRunbookPanelProps {
  checkedText: string;
  status: DashboardServerStatusSnapshot;
}

export function SystemRunbookPanel({ checkedText, status }: SystemRunbookPanelProps) {
  const currentRunbook = publishSessionRunbook(status.signalingReason);
  const { acknowledgement, recoverySuggested, sessionRunbook, submit } = useRunbookAcknowledgement(currentRunbook, checkedText);
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
        {sessionRunbook ? <RunbookAcknowledgementDetails
          acknowledgement={acknowledgement} recoverySuggested={recoverySuggested}
          runbook={sessionRunbook} submit={submit}
        /> : null}
      </dl>
    </section>
  );
}

function useRunbookAcknowledgement(currentRunbook: ReturnType<typeof publishSessionRunbook>, checkedText: string) {
  const [persisted, setPersisted] = useState<Map<string, AlertAcknowledgementState>>(new Map());
  const [queryFailed, setQueryFailed] = useState(false);
  const pendingRecovery = currentRunbook ? null : firstPendingAcknowledgement(persisted);
  const sessionRunbook = currentRunbook ?? (pendingRecovery ? publishSessionRunbookById(pendingRecovery[0]) : null);
  const runbookId = sessionRunbook?.id ?? null;
  const acknowledgement: AlertAcknowledgementState | "error" | null = queryFailed
    ? "error"
    : runbookId ? persisted.get(runbookId) ?? null : null;
  const recoverySuggested = !currentRunbook && pendingRecovery !== null;
  useEffect(() => {
    let active = true;
    void fetchPublishSessionAcknowledgements()
      .then((values) => { if (active) { setPersisted(values); setQueryFailed(false); } })
      .catch(() => { if (active) setQueryFailed(true); });
    return () => { active = false; };
  }, [checkedText]);
  const submit = async (state: AlertAcknowledgementState): Promise<void> => {
    if (!sessionRunbook) return;
    try {
      await acknowledgePublishSessionAlert(sessionRunbook.id, state);
      setPersisted((current) => new Map(current).set(sessionRunbook.id, state));
      setQueryFailed(false);
    } catch {
      setQueryFailed(true);
    }
  };
  return { acknowledgement, recoverySuggested, sessionRunbook, submit };
}

function RunbookAcknowledgementDetails({ acknowledgement, recoverySuggested, runbook, submit }: {
  acknowledgement: AlertAcknowledgementState | "error" | null;
  recoverySuggested: boolean;
  runbook: NonNullable<ReturnType<typeof publishSessionRunbook>>;
  submit: (state: AlertAcknowledgementState) => Promise<void>;
}) {
  return <>
          <div><dt>Runbook</dt><dd>{runbook.id}</dd></div>
          <div><dt>권장 조치</dt><dd>{runbook.action}</dd></div>
          <div><dt>금지 사항</dt><dd>{runbook.caution}</dd></div>
          <div><dt>문서 경로</dt><dd><code>{runbook.documentPath}</code></dd></div>
          {recoverySuggested ? <div><dt>복구 상태</dt><dd role="alert">복구 감지—종료 확인 필요</dd></div> : null}
          <div><dt>조치 상태</dt><dd className="system-status-page__acknowledgement">
            {recoverySuggested ? <button type="button" onClick={() => void submit("resolved")}>종료 확인</button> : <>
              <button type="button" onClick={() => void submit("acknowledged")}>확인</button>
              <button type="button" onClick={() => void submit("in_progress")}>조치 중</button>
              <button type="button" onClick={() => void submit("resolved")}>종료</button>
            </>}
            <span role="status">{acknowledgement === "error" ? "기록 실패" : acknowledgement ?? "미확인"}</span>
          </dd></div>
        </>;
}

function firstPendingAcknowledgement(values: Map<string, AlertAcknowledgementState>): [string, AlertAcknowledgementState] | null {
  for (const entry of values) {
    if (entry[1] !== "resolved") return entry;
  }
  return null;
}

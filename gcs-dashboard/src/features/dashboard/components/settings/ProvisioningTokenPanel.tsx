import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { canManageDeviceProvisioning } from "@auth/rolePermissions";
import { useProvisioningTokens } from "@dashboard/hooks/useProvisioningTokens";
import {
  DEFAULT_PROVISIONING_TOKEN_INPUT,
  type IssueProvisioningTokenInput,
  type ProvisioningTokenRecord,
} from "@dashboard/deviceProvisioningTokens";

type TokenCopyStatus = "idle" | "copied" | "failed";

const TOKEN_COPY_STATUS_LABELS: Readonly<Record<TokenCopyStatus, string>> = {
  copied: "복사됨",
  failed: "복사 실패",
  idle: "클릭해서 복사",
};

export function ProvisioningTokenPanel() {
  const { currentUser } = useAuth();
  const { clearIssuedToken, errorMessage, issuedToken, isIssuing, isLoading, issue, records, refresh } =
    useProvisioningTokens();
  const [form, setForm] = useState<IssueProvisioningTokenInput>(DEFAULT_PROVISIONING_TOKEN_INPUT);
  const [copyStatus, setCopyStatus] = useState<TokenCopyStatus>("idle");
  const isAdmin = canManageDeviceProvisioning(currentUser?.role);

  const submit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin) return;
    void issue(form);
  }, [form, isAdmin, issue]);

  const copyIssuedToken = useCallback(async () => {
    if (!issuedToken) return;
    try {
      await navigator.clipboard.writeText(issuedToken.token);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }, [issuedToken]);

  useEffect(() => {
    setCopyStatus("idle");
  }, [issuedToken?.tokenId]);

  return (
    <section className="time-sync-view__policy provisioning-token-panel" aria-label="장비 등록 토큰">
      <header className="time-sync-view__policy-header provisioning-token-panel__header">
        <div>
          <span>장비 bootstrap</span>
          <strong>로봇/드론 최초 등록 토큰</strong>
        </div>
        <button type="button" onClick={() => void refresh()}>
          새로고침
        </button>
      </header>

      <form className="provisioning-token-panel__form" onSubmit={submit}>
        <label>
          <span>그룹</span>
          <input
            disabled={!isAdmin || isIssuing}
            onChange={(event) => setForm((current) => ({ ...current, groupId: event.target.value }))}
            value={form.groupId}
          />
        </label>
        <label>
          <span>표시 이름</span>
          <input
            disabled={!isAdmin || isIssuing}
            onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
            value={form.label}
          />
        </label>
        <label>
          <span>만료 시간(분)</span>
          <input
            disabled={!isAdmin || isIssuing}
            min={5}
            max={1440}
            onChange={(event) => setForm((current) => ({ ...current, ttlMinutes: Number(event.target.value) }))}
            type="number"
            value={form.ttlMinutes}
          />
        </label>
        <label>
          <span>사용 횟수</span>
          <input
            disabled={!isAdmin || isIssuing}
            min={1}
            max={100}
            onChange={(event) => setForm((current) => ({ ...current, maxUses: Number(event.target.value) }))}
            type="number"
            value={form.maxUses}
          />
        </label>
        <button disabled={!isAdmin || isIssuing} type="submit">
          {isIssuing ? "발급 중" : "토큰 발급"}
        </button>
      </form>

      {!isAdmin ? <p className="provisioning-token-panel__notice">관리자 계정으로 로그인해야 발급할 수 있습니다.</p> : null}
      {errorMessage ? <p className="time-sync-view__error" role="alert">{errorMessage}</p> : null}
      {issuedToken ? (
        <article className="provisioning-token-panel__issued">
          <span>이번 응답에서만 보이는 토큰</span>
          <button
            aria-label="발급된 provisioning token 복사"
            className="provisioning-token-panel__copy-token"
            onClick={() => void copyIssuedToken()}
            type="button"
          >
            <strong>{issuedToken.token}</strong>
            <small>{TOKEN_COPY_STATUS_LABELS[copyStatus]}</small>
          </button>
          <button type="button" onClick={clearIssuedToken}>확인 후 숨기기</button>
        </article>
      ) : null}

      <div className="provisioning-token-panel__records">
        {isLoading ? <p>토큰 목록을 불러오는 중</p> : records.map((record) => (
          <ProvisioningTokenRecordCard key={record.tokenId} record={record} />
        ))}
      </div>
    </section>
  );
}

function ProvisioningTokenRecordCard({ record }: { record: ProvisioningTokenRecord }) {
  return (
    <article className="provisioning-token-panel__record">
      <span>{record.groupId}</span>
      <strong>{record.label}</strong>
      <em>{record.status} · {record.usedCount}/{record.maxUses}</em>
      <small>만료 {new Date(record.expiresAt).toLocaleString()}</small>
    </article>
  );
}

import { useState, type FormEvent } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { canManageDeviceProvisioning } from "@auth/rolePermissions";
import { useSignupTokens } from "@dashboard/hooks/useSignupTokens";
import { DEFAULT_SIGNUP_TOKEN_INPUT, type IssueSignupTokenInput } from "@dashboard/signupTokens";

export function SignupTokenPanel() {
  const { currentUser } = useAuth();
  const { records, issuedToken, isLoading, isIssuing, errorMessage, refresh, issue, clear } = useSignupTokens();
  const [form, setForm] = useState<IssueSignupTokenInput>(DEFAULT_SIGNUP_TOKEN_INPUT);
  const isAdmin = currentUser?.capabilities.canManageMembers ?? canManageDeviceProvisioning(currentUser?.role);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isAdmin) void issue(form);
  };

  return (
    <section className="time-sync-view__policy provisioning-token-panel" aria-label="회원가입 등록 토큰">
      <header className="time-sync-view__policy-header provisioning-token-panel__header">
        <div><span>회원 관리</span><strong>회원가입 등록 토큰</strong></div>
        <button type="button" onClick={() => void refresh()}>새로고침</button>
      </header>
      <p>회원가입 화면의 초대 코드 칸에 입력할 일회성 또는 제한 사용 토큰을 발급합니다.</p>
      <form className="provisioning-token-panel__form" onSubmit={submit}>
        <label><span>회사 ID</span><input type="number" min={1} value={form.companyId}
          disabled={!isAdmin || isIssuing}
          onChange={(e) => setForm({ ...form, companyId: Number(e.target.value) })} /></label>
        <label><span>그룹 ID</span><input value={form.groupId} disabled={!isAdmin || isIssuing}
          onChange={(e) => setForm({ ...form, groupId: e.target.value })} /></label>
        <label><span>가입 권한</span><select className="provisioning-token-panel__role-select" value={form.role} disabled={!isAdmin || isIssuing}
          onChange={(e) => setForm({ ...form, role: e.target.value as IssueSignupTokenInput["role"] })}>
          <option value="viewer">Viewer · 조회 전용</option>
          <option value="operator">Operator · 조회/송출/제어</option>
        </select></label>
        <label><span>표시 이름</span><input value={form.label} disabled={!isAdmin || isIssuing}
          onChange={(e) => setForm({ ...form, label: e.target.value })} /></label>
        <label><span>만료 시간(분)</span><input type="number" min={5} max={10080} value={form.ttlMinutes}
          disabled={!isAdmin || isIssuing}
          onChange={(e) => setForm({ ...form, ttlMinutes: Number(e.target.value) })} /></label>
        <label><span>사용 가능 횟수</span><input type="number" min={1} max={100} value={form.maxUses}
          disabled={!isAdmin || isIssuing}
          onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })} /></label>
        <button type="submit" disabled={!isAdmin || isIssuing}>{isIssuing ? "발급 중" : "회원가입 토큰 발급"}</button>
      </form>
      {!isAdmin ? <p className="provisioning-token-panel__notice">관리자 계정만 발급할 수 있습니다.</p> : null}
      {errorMessage ? <p role="alert" className="time-sync-view__error">{errorMessage}</p> : null}
      {issuedToken ? (
        <article className="provisioning-token-panel__issued">
          <span>이 토큰은 지금 한 번만 표시됩니다.</span>
          <button type="button" className="provisioning-token-panel__copy-token"
            onClick={() => void navigator.clipboard.writeText(issuedToken.token)}>
            <strong>{issuedToken.token}</strong><small>클릭해서 복사</small>
          </button>
          <button type="button" onClick={clear}>확인 후 숨기기</button>
        </article>
      ) : null}
      <div className="provisioning-token-panel__records">
        {isLoading ? <p>토큰 목록을 불러오는 중</p> : records.map((record) => (
          <article className="provisioning-token-panel__record" key={record.tokenId}>
            <span>회사 {record.companyId} · {record.groupId} · {record.role}</span>
            <strong>{record.label}</strong>
            <em>{record.status} · {record.usedCount}/{record.maxUses}</em>
            <small>만료 {new Date(record.expiresAt).toLocaleString()}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { useAuth } from "@/features/auth/AuthProvider";
import { canManageDeviceProvisioning } from "@auth/rolePermissions";
import { useSignupTokens } from "@dashboard/hooks/devices/useSignupTokens";
import { DEFAULT_SIGNUP_TOKEN_INPUT, type IssueSignupTokenInput, type SignupTokenIssue } from "@dashboard/devices/signupTokens";
import { fetchManagedGroups } from "@dashboard/groups/managedGroupApi";
import type { ManagedGroup } from "@dashboard/groups/managedGroups";
import { SignupTokenRecords } from "./SignupTokenRecords";

export function SignupTokenPanel() {
  const { currentUser } = useAuth();
  const { records, issuedToken, isLoading, isIssuing, errorMessage, refresh, issue, clear } = useSignupTokens();
  const [form, setForm] = useState<IssueSignupTokenInput>(DEFAULT_SIGNUP_TOKEN_INPUT);
  const [groups, setGroups] = useState<ManagedGroup[]>([]);
  const [groupError, setGroupError] = useState("");
  const isAdmin = currentUser?.capabilities?.canManageMembers ?? canManageDeviceProvisioning(currentUser?.role);
  useSignupTokenGroups(currentUser, setForm, setGroups, setGroupError);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (isAdmin) void issue(form);
  };

  return (
    <section className="time-sync-view__policy provisioning-token-panel" aria-label="회원가입 등록 토큰">
      <header className="time-sync-view__policy-header provisioning-token-panel__header">
        <div><span>회원 관리</span><strong>회원가입 등록 토큰</strong></div>
        <button className="ops-command-button settings-refresh-button" type="button"
          onClick={() => void refresh()}>새로고침</button>
      </header>
      <p>회원가입 화면의 초대 코드 칸에 입력할 일회성 또는 제한 사용 토큰을 발급합니다.</p>
      <SignupTokenIssueForm {...{ form, groups, isAdmin, isIssuing, setForm, submit }} />
      {!isAdmin ? <p className="provisioning-token-panel__notice">관리자 계정만 발급할 수 있습니다.</p> : null}
      {groupError ? <p role="alert" className="time-sync-view__error">{groupError}</p> : null}
      {errorMessage ? <p role="alert" className="time-sync-view__error">{errorMessage}</p> : null}
      {issuedToken ? <IssuedSignupToken issuedToken={issuedToken} onClear={clear} /> : null}
      <SignupTokenRecords isLoading={isLoading} records={records} />
    </section>
  );
}

function SignupTokenIssueForm({ form, groups, isAdmin, isIssuing, setForm, submit }: {
  form: IssueSignupTokenInput; groups: ManagedGroup[]; isAdmin: boolean; isIssuing: boolean;
  setForm: Dispatch<SetStateAction<IssueSignupTokenInput>>; submit: (event: FormEvent) => void;
}) {
  return <form className="provisioning-token-panel__form signup-token-panel__form" onSubmit={submit}>
    <label><span>그룹</span><select value={form.groupId} disabled={!isAdmin || isIssuing || groups.length === 0}
      onChange={(event) => setForm({ ...form, groupId: event.target.value })}>
      {groups.map((group) => <option key={group.id} value={group.id}>
        {group.name} · {group.id} · {group.status === "active" ? "활성" : "비활성"}
      </option>)}
    </select></label>
    <label><span>가입 권한</span><select className="provisioning-token-panel__role-select" value={form.role}
      disabled={!isAdmin || isIssuing}
      onChange={(event) => setForm({ ...form, role: event.target.value as IssueSignupTokenInput["role"] })}>
      <option value="viewer">Viewer · 조회 전용</option><option value="operator">Operator · 조회/송출/제어</option>
    </select></label>
    <label><span>표시 이름</span><input value={form.label} disabled={!isAdmin || isIssuing}
      onChange={(event) => setForm({ ...form, label: event.target.value })} /></label>
    <label><span>만료 시간(분)</span><input type="number" min={5} max={10080} value={form.ttlMinutes}
      disabled={!isAdmin || isIssuing}
      onChange={(event) => setForm({ ...form, ttlMinutes: Number(event.target.value) })} /></label>
    <label><span>사용 가능 횟수</span><input type="number" min={1} max={100} value={form.maxUses}
      disabled={!isAdmin || isIssuing}
      onChange={(event) => setForm({ ...form, maxUses: Number(event.target.value) })} /></label>
    <button className="signup-token-panel__submit" type="submit"
      disabled={!isAdmin || isIssuing || !groups.some((group) => group.id === form.groupId)}>
      {isIssuing ? "발급 중" : "회원가입 토큰 발급"}
    </button>
  </form>;
}
function IssuedSignupToken({ issuedToken, onClear }: { issuedToken: SignupTokenIssue; onClear: () => void }) {
  return <article className="provisioning-token-panel__issued">
    <span>이 토큰은 지금 한 번만 표시됩니다.</span>
    <button type="button" className="provisioning-token-panel__copy-token"
      onClick={() => void navigator.clipboard.writeText(issuedToken.token)}>
      <strong>{issuedToken.token}</strong><small>클릭해서 복사</small>
    </button>
    <button type="button" onClick={onClear}>확인 후 숨기기</button>
  </article>;
}

function useSignupTokenGroups(
  currentUser: ReturnType<typeof useAuth>["currentUser"],
  setForm: Dispatch<SetStateAction<IssueSignupTokenInput>>,
  setGroups: Dispatch<SetStateAction<ManagedGroup[]>>,
  setGroupError: Dispatch<SetStateAction<string>>,
): void {
  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role !== "admin") {
      setGroups([{ id: currentUser.groupId, name: currentUser.groupId, type: "company", parentId: null, status: "active" }]);
      setForm((current) => ({ ...current, groupId: currentUser.groupId }));
      return;
    }
    let disposed = false;
    void fetchManagedGroups().then((records) => {
      if (disposed) return;
      setGroups(records);
      setForm((current) => records.some((group) => group.id === current.groupId)
        ? current : { ...current, groupId: records[0]?.id ?? "" });
      setGroupError("");
    }).catch((error) => {
      if (!disposed) setGroupError(error instanceof Error ? error.message : "그룹 목록을 불러오지 못했습니다.");
    });
    return () => { disposed = true; };
  }, [currentUser, setForm, setGroupError, setGroups]);
}

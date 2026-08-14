import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@auth/AuthProvider";
import { fetchAccessibleGroupInventory } from "@dashboard/groupAssetApi";
import { fetchManagedGroups } from "@dashboard/managedGroupApi";
import { fetchGroupMembers, replaceGroupAdministrator, updateGroupMember } from "@dashboard/groupMemberApi";
import type { GroupMember } from "@dashboard/groupMembers";

export function GroupMemberPanel() {
  const { currentUser } = useAuth();
  const [groupId, setGroupId] = useState(currentUser?.groupId ?? "");
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [error, setError] = useState("");
  const [administratorCandidate, setAdministratorCandidate] = useState("");

  const refresh = useCallback(async (targetGroupId = groupId): Promise<void> => {
    if (!targetGroupId) return;
    try {
      setMembers(await fetchGroupMembers(targetGroupId));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "회원 목록을 불러오지 못했습니다.");
    }
  }, [groupId]);

  useEffect(() => {
    let disposed = false;
    const groupRequest = currentUser?.role === "admin"
      ? fetchManagedGroups().then((managedGroups) => ({ groups: managedGroups }))
      : fetchAccessibleGroupInventory();
    void groupRequest.then((inventory) => {
      if (!disposed) {
        const visibleGroups = currentUser?.role === "admin"
          ? inventory.groups
          : inventory.groups.filter((group) => group.id === currentUser?.groupId);
        setGroups(visibleGroups.map(({ id, name }) => ({ id, name })));
      }
    });
    return () => { disposed = true; };
  }, [currentUser?.groupId, currentUser?.role]);

  useEffect(() => { void refresh(groupId); }, [groupId, refresh]);

  const mutate = async (member: GroupMember, update: { role?: "viewer" | "operator"; active?: boolean; password?: string }): Promise<void> => {
    try {
      await updateGroupMember(groupId, member.username, update);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "회원을 변경하지 못했습니다.");
    }
  };

  const appoint = async (username: string): Promise<void> => {
    try {
      await replaceGroupAdministrator(groupId, username);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "그룹 관리자를 지정하지 못했습니다.");
    }
  };

  return (
    <section className="time-sync-view__policy device-approval-panel" aria-label="그룹 회원 관리">
      <header className="time-sync-view__policy-header provisioning-token-panel__header">
        <div><span>계층 권한</span><strong>그룹 회원 관리</strong></div>
        <button type="button" onClick={() => void refresh()}>새로고침</button>
      </header>
      <label>
        <span>관리 그룹</span>
        <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </label>
      {currentUser?.role === "admin" ? (
        <div className="device-approval-panel__actions">
          <input
            aria-label="새 그룹 관리자 사용자명"
            onChange={(event) => setAdministratorCandidate(event.target.value)}
            placeholder="기존 viewer/operator 사용자명"
            value={administratorCandidate}
          />
          <button disabled={!administratorCandidate.trim()} type="button" onClick={() => void appoint(administratorCandidate.trim()).then(() => setAdministratorCandidate(""))}>
            그룹 관리자 지정 또는 교체
          </button>
        </div>
      ) : null}
      {error ? <p className="time-sync-view__error" role="alert">{error}</p> : null}
      <div className="device-approval-panel__list">
        {members.map((member) => (
          <article className="device-approval-panel__card" key={member.username}>
            <div><span>{member.role} · {member.active ? "활성" : "비활성"}</span><strong>{member.username}</strong><small>{member.email}</small></div>
            <MemberActions
              canAppoint={currentUser?.role === "admin"}
              member={member}
              onAppoint={appoint}
              onUpdate={mutate}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

function MemberActions({
  canAppoint,
  member,
  onAppoint,
  onUpdate,
}: {
  canAppoint: boolean;
  member: GroupMember;
  onAppoint: (username: string) => Promise<void>;
  onUpdate: (member: GroupMember, update: { role?: "viewer" | "operator"; active?: boolean; password?: string }) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  if (member.role === "group_admin") return <div className="device-approval-panel__actions"><span>그룹 관리자</span></div>;
  return (
    <div className="device-approval-panel__actions">
      <button type="button" onClick={() => void onUpdate(member, { role: member.role === "viewer" ? "operator" : "viewer" })}>역할 변경</button>
      <button type="button" onClick={() => void onUpdate(member, { active: !member.active })}>{member.active ? "비활성화" : "활성화"}</button>
      <input
        aria-label={`${member.username} 임시 비밀번호`}
        minLength={12}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="임시 비밀번호 12자 이상"
        type="password"
        value={password}
      />
      <button disabled={password.length < 12} type="button" onClick={() => void onUpdate(member, { password }).then(() => setPassword(""))}>비밀번호 초기화</button>
      {canAppoint ? <button type="button" onClick={() => void onAppoint(member.username)}>관리자 지정</button> : null}
    </div>
  );
}

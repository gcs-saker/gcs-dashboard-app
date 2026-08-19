import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@auth/AuthProvider";
import { fetchAccessibleGroupInventory } from "@dashboard/assets/groupAssetApi";
import { fetchManagedGroups } from "@dashboard/groups/managedGroupApi";
import { fetchGroupMembers, replaceGroupAdministrator, updateGroupMember } from "@dashboard/groups/groupMemberApi";
import type { GroupMember } from "@dashboard/groups/groupMembers";

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

  return <GroupMemberPanelView {...{ administratorCandidate, appoint, currentUser, error, groupId, groups,
    members, mutate, refresh, setAdministratorCandidate, setGroupId }} />;
}

function GroupMemberPanelView(props: {
  administratorCandidate: string;
  appoint: (username: string) => Promise<void>;
  currentUser: ReturnType<typeof useAuth>["currentUser"];
  error: string;
  groupId: string;
  groups: Array<{ id: string; name: string }>;
  members: GroupMember[];
  mutate: (member: GroupMember, update: { role?: "viewer" | "operator"; active?: boolean; password?: string }) => Promise<void>;
  refresh: () => Promise<void>;
  setAdministratorCandidate: (value: string) => void;
  setGroupId: (value: string) => void;
}) {
  return (
    <section className="time-sync-view__policy device-approval-panel" aria-label="그룹 회원 관리">
      <header className="time-sync-view__policy-header provisioning-token-panel__header">
        <div><span>계층 권한</span><strong>그룹 회원 관리</strong></div>
        <button type="button" onClick={() => void props.refresh()}>새로고침</button>
      </header>
      <label>
        <span>관리 그룹</span>
        <select value={props.groupId} onChange={(event) => props.setGroupId(event.target.value)}>
          {props.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </label>
      {props.currentUser?.role === "admin" ? (
        <div className="device-approval-panel__actions">
          <input
            aria-label="새 그룹 관리자 사용자명"
            onChange={(event) => props.setAdministratorCandidate(event.target.value)}
            placeholder="기존 viewer/operator 사용자명"
            value={props.administratorCandidate}
          />
          <button disabled={!props.administratorCandidate.trim()} type="button" onClick={() => void props.appoint(props.administratorCandidate.trim()).then(() => props.setAdministratorCandidate(""))}>
            그룹 관리자 지정 또는 교체
          </button>
        </div>
      ) : null}
      {props.error ? <p className="time-sync-view__error" role="alert">{props.error}</p> : null}
      <div className="device-approval-panel__list">
        {props.members.map((member) => (
          <article className="device-approval-panel__card" key={member.username}>
            <div><span>{member.role} · {member.active ? "활성" : "비활성"}</span><strong>{member.username}</strong><small>{member.email}</small></div>
            <MemberActions
              canAppoint={props.currentUser?.role === "admin"}
              member={member}
              onAppoint={props.appoint}
              onUpdate={props.mutate}
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

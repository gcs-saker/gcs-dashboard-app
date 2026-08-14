import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@auth/AuthProvider";
import { fetchAccessibleGroupInventory } from "@dashboard/groupAssetApi";
import { fetchGroupMembers, replaceGroupAdministrator, updateGroupMember } from "@dashboard/groupMemberApi";
import type { GroupMember } from "@dashboard/groupMembers";

export function GroupMemberPanel() {
  const { currentUser } = useAuth();
  const [groupId, setGroupId] = useState(currentUser?.groupId ?? "");
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [error, setError] = useState("");

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
    void fetchAccessibleGroupInventory().then((inventory) => {
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

  const mutate = async (member: GroupMember, update: { role?: "viewer" | "operator"; active?: boolean }): Promise<void> => {
    await updateGroupMember(groupId, member.username, update);
    await refresh();
  };

  const appoint = async (username: string): Promise<void> => {
    await replaceGroupAdministrator(groupId, username);
    await refresh();
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
      {error ? <p className="time-sync-view__error" role="alert">{error}</p> : null}
      <div className="device-approval-panel__list">
        {members.map((member) => (
          <article className="device-approval-panel__card" key={member.username}>
            <div><span>{member.role} · {member.active ? "활성" : "비활성"}</span><strong>{member.username}</strong><small>{member.email}</small></div>
            <div className="device-approval-panel__actions">
              {member.role !== "group_admin" ? (
                <>
                  <button type="button" onClick={() => void mutate(member, { role: member.role === "viewer" ? "operator" : "viewer" })}>역할 변경</button>
                  <button type="button" onClick={() => void mutate(member, { active: !member.active })}>{member.active ? "비활성화" : "활성화"}</button>
                  {currentUser?.role === "admin" ? <button type="button" onClick={() => void appoint(member.username)}>관리자 지정</button> : null}
                </>
              ) : <span>그룹 관리자</span>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

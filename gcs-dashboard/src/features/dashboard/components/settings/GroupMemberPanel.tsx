import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@auth/AuthProvider";
import { fetchAccessibleGroupInventory } from "@dashboard/assets/groupAssetApi";
import { fetchManagedGroups } from "@dashboard/groups/managedGroupApi";
import { fetchGroupMembers, replaceGroupAdministrator, updateGroupMember } from "@dashboard/groups/groupMemberApi";
import type { GroupMember } from "@dashboard/groups/groupMembers";
import { GroupMemberBrowser } from "./GroupMemberBrowser";

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
        <button className="ops-command-button settings-refresh-button" type="button"
          onClick={() => void props.refresh()}>새로고침</button>
      </header>
      <label className="group-member-panel__group-field">
        <span>관리 그룹</span>
        <select value={props.groupId} onChange={(event) => props.setGroupId(event.target.value)}>
          {props.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
      </label>
      {props.currentUser?.role === "admin" ? (
        <div className="group-member-panel__appoint">
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
      <GroupMemberBrowser canAppoint={props.currentUser?.role === "admin"} members={props.members}
        onAppoint={props.appoint} onUpdate={props.mutate} />
    </section>
  );
}

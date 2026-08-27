import { useCallback, useEffect, useRef, useState } from "react";
import { fetchGroupMembers, replaceGroupAdministrator, updateGroupMember } from "@dashboard/groups/groupMemberApi";
import type { GroupMember, GroupMemberUpdate } from "@dashboard/groups/groupMembers";
import { toErrorMessage } from "./useOrganizationDirectory";

export function useOrganizationMembers(groupId?: string) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [error, setError] = useState("");
  const latestRequest = useRef(0);
  const refresh = useCallback(async (): Promise<void> => {
    const requestId = ++latestRequest.current;
    if (!groupId) { setMembers([]); return; }
    try {
      const records = await fetchGroupMembers(groupId);
      if (requestId === latestRequest.current) { setMembers(records); setError(""); }
    } catch (reason) {
      if (requestId === latestRequest.current) setError(toErrorMessage(reason, "회원 목록을 불러오지 못했습니다."));
    }
  }, [groupId]);
  useEffect(() => { void refresh(); }, [refresh]);
  const appoint = async (username: string): Promise<void> => {
    if (!groupId) return;
    try { await replaceGroupAdministrator(groupId, username); await refresh(); }
    catch (reason) { setError(toErrorMessage(reason, "그룹 관리자를 지정하지 못했습니다.")); }
  };
  const mutate = async (member: GroupMember, update: GroupMemberUpdate): Promise<void> => {
    if (!groupId) return;
    try { await updateGroupMember(groupId, member.username, update); await refresh(); }
    catch (reason) { setError(toErrorMessage(reason, "회원을 변경하지 못했습니다.")); }
  };
  return { appoint, error, members, mutate, refresh };
}

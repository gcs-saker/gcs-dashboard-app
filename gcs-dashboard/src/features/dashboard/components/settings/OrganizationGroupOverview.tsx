import { useState } from "react";
import { changeManagedGroupStatus, updateManagedGroup } from "@dashboard/groups/managedGroupApi";
import type { ManagedGroup } from "@dashboard/groups/managedGroups";
import type { GroupMember } from "@dashboard/groups/groupMembers";
import { groupTypeLabel } from "@dashboard/groups/organizationHierarchy";
import { issueSignupToken } from "@dashboard/devices/signupTokenApi";
import type { SignupTokenIssue } from "@dashboard/devices/signupTokens";

export function OrganizationGroupOverview({ group, groups, members, onAppoint, onChanged, onError, onRefreshMembers }: {
  group: ManagedGroup; groups: ManagedGroup[]; members: GroupMember[];
  onAppoint: (username: string) => Promise<void>; onChanged: () => Promise<void>;
  onError: (message: string) => void; onRefreshMembers: () => Promise<void>;
}) {
  const [name, setName] = useState(group.name);
  const [parentId, setParentId] = useState(group.parentId ?? "");
  const [candidate, setCandidate] = useState("");
  const [issuedInvite, setIssuedInvite] = useState<SignupTokenIssue | null>(null);
  const groupAdmins = members.filter((member) => member.role === "group_admin" && member.active);
  const candidates = members.filter((member) => member.role !== "group_admin" && member.active);
  const activationBlocked = group.status === "inactive" && groupAdmins.length !== 1;
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    try { await action(); await onChanged(); }
    catch (reason) { onError(reason instanceof Error ? reason.message : "그룹을 변경하지 못했습니다."); }
  };
  const invite = async (): Promise<void> => {
    try {
      setIssuedInvite(await issueSignupToken({ companyId: 1, groupId: group.id, role: "operator",
        label: `${group.name} 최초 관리자 초대`, ttlMinutes: 1440, maxUses: 1 }));
    } catch (reason) { onError(reason instanceof Error ? reason.message : "관리자 초대를 발급하지 못했습니다."); }
  };
  return <div className="organization-overview">
    <section className="organization-overview__card">
      <header><div><span>{groupTypeLabel(group.type)}</span><strong>{group.name}</strong><small>그룹 ID · {group.id}</small></div>
        <em className={`is-${group.status}`}>{group.status === "active" ? "활성" : "비활성"}</em></header>
      <div className="organization-overview__fields">
        <label><span>그룹 이름</span><input onChange={(event) => setName(event.target.value)} value={name} /></label>
        <label><span>상위 그룹</span><select onChange={(event) => setParentId(event.target.value)} value={parentId}>
          <option value="">없음</option>{groups.filter((item) => item.id !== group.id && item.status === "active").map((item) =>
            <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <button onClick={() => void run(() => updateManagedGroup(group.id, { name, parentId: parentId || null, changeParent: true }))} type="button">변경 저장</button>
        <button className={group.status === "active" ? "is-danger" : "is-primary"} disabled={activationBlocked}
          onClick={() => void run(() => changeManagedGroupStatus(group.id, group.status !== "active"))}
          title={activationBlocked ? "활성 group_admin 1명이 필요합니다." : undefined} type="button">
          {group.status === "active" ? "비활성화" : "활성화"}</button>
      </div>
    </section>
    <section className="organization-bootstrap">
      <header><div><span>그룹 관리자</span><strong>{groupAdmins.length === 1 ? groupAdmins[0].username : "최초 관리자 필요"}</strong></div>
        <em className={groupAdmins.length === 1 ? "is-ready" : "is-waiting"}>{groupAdmins.length === 1 ? "활성화 준비" : "관리자 없음"}</em></header>
      {groupAdmins.length === 0 ? <p>이 그룹에 가입한 운영자를 선택해 관리자로 지정하거나, 전용 초대를 발급하세요.</p> : null}
      <div className="organization-bootstrap__actions">
        <select aria-label="관리자 후보" onChange={(event) => setCandidate(event.target.value)} value={candidate}>
          <option value="">관리자 후보 선택</option>{candidates.map((member) => <option key={member.username} value={member.username}>{member.username} · {member.role}</option>)}</select>
        <button disabled={!candidate} onClick={() => void onAppoint(candidate).then(() => setCandidate(""))} type="button">관리자로 지정</button>
        <button onClick={() => void invite()} type="button">관리자 초대</button>
        <button onClick={() => void onRefreshMembers()} type="button">가입 상태 확인</button>
      </div>
      {issuedInvite ? <div className="organization-bootstrap__token"><span>지금 한 번만 표시됩니다.</span>
        <button onClick={() => void navigator.clipboard.writeText(issuedInvite.token)} type="button"><strong>{issuedInvite.token}</strong><small>클릭해서 복사</small></button>
        <button onClick={() => setIssuedInvite(null)} type="button">숨기기</button></div> : null}
    </section>
  </div>;
}

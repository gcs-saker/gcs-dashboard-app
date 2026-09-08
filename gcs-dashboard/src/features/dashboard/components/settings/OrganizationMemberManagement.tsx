import type { GroupMember } from "@dashboard/groups/groupMembers";
import type { ManagedGroup } from "@dashboard/groups/managedGroups";
import { GroupMemberBrowser } from "./GroupMemberBrowser";

export function OrganizationMemberManagement({ group, members, onAppoint, onRefresh, onUpdate }: {
  group: ManagedGroup; members: GroupMember[]; onAppoint: (username: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onUpdate: (member: GroupMember, update: { role?: "viewer" | "operator"; active?: boolean; password?: string }) => Promise<void>;
}) {
  return <section className="organization-members" aria-label={`${group.name} 회원 관리`}>
    <header><div><span>선택 그룹 회원</span><strong>{group.name} · {members.length}명</strong></div>
      <button onClick={() => void onRefresh()} type="button">새로고침</button></header>
    <GroupMemberBrowser canAppoint members={members} onAppoint={onAppoint} onUpdate={onUpdate} />
  </section>;
}

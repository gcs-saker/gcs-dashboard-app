import { useState } from "react";
import type { GroupMember } from "@dashboard/groups/groupMembers";

export function MemberActions({ canAppoint, member, onAppoint, onUpdate }: {
  canAppoint: boolean;
  member: GroupMember;
  onAppoint: (username: string) => Promise<void>;
  onUpdate: (member: GroupMember, update: { role?: "viewer" | "operator"; active?: boolean; password?: string }) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  if (member.role === "group_admin") return <div className="group-member-actions"><span>그룹 관리자 계정</span></div>;
  return <div className="group-member-actions">
    <button type="button" onClick={() => void onUpdate(member, { role: member.role === "viewer" ? "operator" : "viewer" })}>역할 변경</button>
    <button type="button" onClick={() => void onUpdate(member, { active: !member.active })}>{member.active ? "비활성화" : "활성화"}</button>
    <input aria-label={`${member.username} 임시 비밀번호`} minLength={12}
      onChange={(event) => setPassword(event.target.value)} placeholder="임시 비밀번호 12자 이상"
      type="password" value={password} />
    <button disabled={password.length < 12} type="button"
      onClick={() => void onUpdate(member, { password }).then(() => setPassword(""))}>비밀번호 초기화</button>
    {canAppoint ? <button type="button" onClick={() => void onAppoint(member.username)}>관리자 지정</button> : null}
  </div>;
}

import { useState } from "react";
import type { GroupMember } from "@dashboard/groups/groupMembers";
import { MemberActions } from "./MemberActions";

const PAGE_SIZE = 5;

export function GroupMemberBrowser({ canAppoint, members, onAppoint, onUpdate }: {
  canAppoint: boolean; members: GroupMember[];
  onAppoint: (username: string) => Promise<void>;
  onUpdate: (member: GroupMember, update: { role?: "viewer" | "operator"; active?: boolean; password?: string }) => Promise<void>;
}) {
  const [page, setPage] = useState(0);
  const [selectedUsername, setSelectedUsername] = useState("");
  const pageCount = Math.max(1, Math.ceil(members.length / PAGE_SIZE));
  const visible = members.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selected = visible.find((member) => member.username === selectedUsername) ?? visible[0];
  if (!selected) return <p className="group-member-panel__empty">등록된 회원이 없습니다.</p>;
  return <div className="settings-paged-list group-member-browser">
    <div className="settings-listbox" role="listbox" aria-label="그룹 회원 목록">
      {visible.map((member) => <button aria-selected={member.username === selected.username} key={member.username}
        onClick={() => setSelectedUsername(member.username)} role="option" type="button">
        <strong>{member.username}</strong><span>{member.role} · {member.active ? "활성" : "비활성"}</span>
      </button>)}
    </div>
    <article className="group-member-editor">
      <header><div><span>{selected.role}</span><strong>{selected.username}</strong><small>{selected.email}</small></div>
        <em className={selected.active ? "is-active" : "is-inactive"}>{selected.active ? "활성" : "비활성"}</em></header>
      <MemberActions canAppoint={canAppoint} member={selected} onAppoint={onAppoint} onUpdate={onUpdate} />
    </article>
    <nav className="settings-pagination" aria-label="회원 페이지">
      <button disabled={page === 0} onClick={() => setPage(page - 1)} type="button">이전</button>
      <span>{page + 1} / {pageCount}</span>
      <button disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)} type="button">다음</button>
    </nav>
  </div>;
}

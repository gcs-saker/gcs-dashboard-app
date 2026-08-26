import { useState } from "react";
import { changeManagedGroupStatus, updateManagedGroup } from "@dashboard/groups/managedGroupApi";
import type { ManagedGroup } from "@dashboard/groups/managedGroups";

const PAGE_SIZE = 5;

export function GroupLifecycleBrowser({ groups, onChanged, onError }: {
  groups: ManagedGroup[]; onChanged: () => Promise<void>; onError: (message: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const pageCount = Math.max(1, Math.ceil(groups.length / PAGE_SIZE));
  const visible = groups.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selected = visible.find((group) => group.id === selectedId) ?? visible[0];
  if (!selected) return <p className="group-lifecycle-empty">등록된 그룹이 없습니다.</p>;
  return <div className="settings-paged-list group-lifecycle-browser">
    <div className="settings-listbox" role="listbox" aria-label="그룹 목록">
      {visible.map((group) => <button aria-selected={group.id === selected.id} key={group.id}
        onClick={() => setSelectedId(group.id)} role="option" type="button">
        <strong>{group.name}</strong><span>{group.type} · {group.status}</span>
      </button>)}
    </div>
    <GroupEditor group={selected} groups={groups} key={selected.id} onChanged={onChanged} onError={onError} />
    <nav className="settings-pagination" aria-label="그룹 페이지">
      <button disabled={page === 0} onClick={() => setPage(page - 1)} type="button">이전</button>
      <span>{page + 1} / {pageCount}</span>
      <button disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)} type="button">다음</button>
    </nav>
  </div>;
}

function GroupEditor({ group, groups, onChanged, onError }: {
  group: ManagedGroup; groups: ManagedGroup[]; onChanged: () => Promise<void>; onError: (message: string) => void;
}) {
  const [name, setName] = useState(group.name);
  const [parentId, setParentId] = useState(group.parentId ?? "");
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    try { await action(); await onChanged(); }
    catch (reason) { onError(reason instanceof Error ? reason.message : "그룹을 변경하지 못했습니다."); }
  };
  return <article className="group-lifecycle-editor">
    <header><div><span>{group.type}</span><strong>{group.id}</strong></div>
      <em className={`is-${group.status}`}>{group.status === "active" ? "활성" : "비활성"}</em></header>
    <div className="group-lifecycle-editor__fields">
      <label><span>그룹 이름</span><input aria-label={`${group.id} 이름`} value={name}
        onChange={(event) => setName(event.target.value)} /></label>
      <label><span>상위 그룹</span><select aria-label={`${group.id} 상위 그룹`} value={parentId}
        onChange={(event) => setParentId(event.target.value)}><option value="">없음</option>
        {groups.filter((candidate) => candidate.id !== group.id && candidate.status === "active")
          .map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
      <button type="button" onClick={() => void run(() => updateManagedGroup(group.id,
        { name, parentId: parentId || null, changeParent: true }))}>변경 저장</button>
      <button className="group-lifecycle-editor__status" type="button"
        onClick={() => void run(() => changeManagedGroupStatus(group.id, group.status !== "active"))}>
        {group.status === "active" ? "비활성화" : "활성화"}
      </button>
    </div>
  </article>;
}

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { changeManagedGroupStatus, createManagedGroup, fetchManagedGroups, updateManagedGroup } from "@dashboard/groups/managedGroupApi";
import type { ManagedGroup } from "@dashboard/groups/managedGroups";

export function GroupLifecyclePanel() {
  const [groups, setGroups] = useState<ManagedGroup[]>([]);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ id: "", name: "", type: "company" as ManagedGroup["type"], parentId: "" });
  const refresh = useCallback(async (): Promise<void> => {
    try { setGroups(await fetchManagedGroups()); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "그룹을 불러오지 못했습니다."); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const create = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    try {
      await createManagedGroup({ ...draft, parentId: draft.parentId || null });
      setDraft({ id: "", name: "", type: "company", parentId: "" });
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "그룹을 생성하지 못했습니다."); }
  };

  return (
    <section className="time-sync-view__policy device-approval-panel" aria-label="그룹 생명주기 관리">
      <header className="time-sync-view__policy-header"><div><span>조직</span><strong>그룹 생명주기</strong></div></header>
      <form className="device-approval-panel__actions" onSubmit={(event) => void create(event)}>
        <input aria-label="그룹 ID" required value={draft.id} onChange={(event) => setDraft({ ...draft, id: event.target.value })} />
        <input aria-label="그룹 이름" required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <select aria-label="그룹 유형" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as ManagedGroup["type"] })}>
          <option value="battalion">대대</option><option value="company">중대</option><option value="platoon">소대</option><option value="squad">분대</option>
        </select>
        <select aria-label="상위 그룹" value={draft.parentId} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}>
          <option value="">없음</option>{groups.filter((group) => group.status === "active").map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select>
        <button type="submit">비활성 그룹 생성</button>
      </form>
      {error ? <p className="time-sync-view__error" role="alert">{error}</p> : null}
      <div className="device-approval-panel__list">
        {groups.map((group) => <GroupLifecycleCard group={group} groups={groups} key={group.id} onChanged={refresh} onError={setError} />)}
      </div>
    </section>
  );
}

function GroupLifecycleCard({ group, groups, onChanged, onError }: {
  group: ManagedGroup; groups: ManagedGroup[]; onChanged: () => Promise<void>; onError: (message: string) => void;
}) {
  const [name, setName] = useState(group.name);
  const [parentId, setParentId] = useState(group.parentId ?? "");
  const run = async (action: () => Promise<unknown>): Promise<void> => {
    try { await action(); await onChanged(); } catch (reason) { onError(reason instanceof Error ? reason.message : "그룹을 변경하지 못했습니다."); }
  };
  return <article className="device-approval-panel__card">
    <div><span>{group.type} · {group.status}</span><strong>{group.id}</strong></div>
    <div className="device-approval-panel__actions">
      <input aria-label={`${group.id} 이름`} value={name} onChange={(event) => setName(event.target.value)} />
      <select aria-label={`${group.id} 상위 그룹`} value={parentId} onChange={(event) => setParentId(event.target.value)}>
        <option value="">없음</option>{groups.filter((candidate) => candidate.id !== group.id && candidate.status === "active").map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
      </select>
      <button type="button" onClick={() => void run(() => updateManagedGroup(group.id, { name, parentId: parentId || null, changeParent: true }))}>저장</button>
      <button type="button" onClick={() => void run(() => changeManagedGroupStatus(group.id, group.status !== "active"))}>{group.status === "active" ? "비활성화" : "활성화"}</button>
    </div>
  </article>;
}

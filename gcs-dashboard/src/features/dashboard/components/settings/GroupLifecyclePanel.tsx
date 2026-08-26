import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createManagedGroup, fetchManagedGroups } from "@dashboard/groups/managedGroupApi";
import type { ManagedGroup } from "@dashboard/groups/managedGroups";
import { GroupLifecycleBrowser } from "./GroupLifecycleBrowser";

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
      <form className="group-lifecycle-form" onSubmit={(event) => void create(event)}>
        <label><span>그룹 ID</span><input aria-label="그룹 ID" placeholder="예: co-c" required value={draft.id}
          onChange={(event) => setDraft({ ...draft, id: event.target.value })} /></label>
        <label><span>그룹 이름</span><input aria-label="그룹 이름" placeholder="예: C Company" required value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label><span>그룹 유형</span><select aria-label="그룹 유형" value={draft.type}
          onChange={(event) => setDraft({ ...draft, type: event.target.value as ManagedGroup["type"] })}>
          <option value="battalion">대대</option><option value="company">중대</option><option value="platoon">소대</option><option value="squad">분대</option>
        </select></label>
        <label><span>상위 그룹</span><select aria-label="상위 그룹" value={draft.parentId}
          onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}>
          <option value="">없음</option>{groups.filter((group) => group.status === "active").map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select></label>
        <button type="submit">비활성 그룹 생성</button>
      </form>
      {error ? <p className="time-sync-view__error" role="alert">{error}</p> : null}
      <GroupLifecycleBrowser groups={groups} onChanged={refresh} onError={setError} />
    </section>
  );
}

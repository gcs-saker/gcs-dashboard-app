import { useState, type FormEvent } from "react";
import { createManagedGroup } from "@dashboard/groups/managedGroupApi";
import type { ManagedGroup } from "@dashboard/groups/managedGroups";
import { groupTypeLabel } from "@dashboard/groups/organizationHierarchy";

export function OrganizationCreateGroupForm({ groups, parentId, onCancel, onCreated, onError }: {
  groups: ManagedGroup[]; parentId: string | null; onCancel: () => void;
  onCreated: (group: ManagedGroup) => Promise<void>; onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState({ id: "", name: "", type: "company" as ManagedGroup["type"], parentId: parentId ?? "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setIsSubmitting(true);
    try { await onCreated(await createManagedGroup({ ...draft, parentId: draft.parentId || null })); }
    catch (reason) { onError(reason instanceof Error ? reason.message : "그룹을 생성하지 못했습니다."); }
    finally { setIsSubmitting(false); }
  };
  return <form aria-label="그룹 생성" className="organization-create" onSubmit={(event) => void submit(event)}>
    <header><div><span>새 조직</span><strong>그룹 생성</strong></div><button onClick={onCancel} type="button">닫기</button></header>
    <p>그룹은 비활성 상태로 생성됩니다. 최초 관리자를 지정한 뒤 활성화할 수 있습니다.</p>
    <div className="organization-create__fields">
      <label><span>그룹 이름</span><input autoFocus onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        placeholder="예: C Company" required value={draft.name} /></label>
      <label><span>그룹 ID</span><input onChange={(event) => setDraft({ ...draft, id: event.target.value })}
        pattern="[a-z0-9-]+" placeholder="예: co-c" required value={draft.id} /></label>
      <label><span>그룹 유형</span><select onChange={(event) => setDraft({ ...draft, type: event.target.value as ManagedGroup["type"] })} value={draft.type}>
        {(["battalion", "company", "platoon", "squad"] as const).map((type) =>
          <option key={type} value={type}>{groupTypeLabel(type)}</option>)}</select></label>
      <label><span>상위 그룹</span><select onChange={(event) => setDraft({ ...draft, parentId: event.target.value })} value={draft.parentId}>
        <option value="">없음</option>{groups.filter((group) => group.status === "active").map((group) =>
          <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
    </div>
    <footer><button onClick={onCancel} type="button">취소</button><button className="is-primary" disabled={isSubmitting} type="submit">
      {isSubmitting ? "생성 중" : "그룹 생성"}</button></footer>
  </form>;
}

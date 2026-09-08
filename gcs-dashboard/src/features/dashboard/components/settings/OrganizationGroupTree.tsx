import { useMemo, useState, type CSSProperties } from "react";
import type { ManagedGroup } from "@dashboard/groups/managedGroups";
import { flattenGroupHierarchy, groupTypeLabel } from "@dashboard/groups/organizationHierarchy";

export function OrganizationGroupTree({ groups, selectedGroupId, onCreate, onSelect }: {
  groups: ManagedGroup[]; selectedGroupId: string; onCreate: () => void; onSelect: (groupId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | ManagedGroup["status"]>("all");
  const visibleGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ko");
    return flattenGroupHierarchy(groups).filter((group) =>
      (status === "all" || group.status === status) &&
      (!normalizedQuery || `${group.name} ${group.id}`.toLocaleLowerCase("ko").includes(normalizedQuery)));
  }, [groups, query, status]);

  return <aside className="organization-tree" aria-label="조직 계층">
    <header><div><span>조직</span><strong>그룹 계층</strong></div><button onClick={onCreate} type="button">+ 그룹</button></header>
    <div className="organization-tree__filters">
      <input aria-label="그룹 검색" onChange={(event) => setQuery(event.target.value)} placeholder="그룹 검색" value={query} />
      <select aria-label="그룹 상태 필터" onChange={(event) => setStatus(event.target.value as typeof status)} value={status}>
        <option value="all">전체</option><option value="active">활성</option><option value="inactive">비활성</option>
      </select>
    </div>
    <div className="organization-tree__nodes" role="tree">
      {visibleGroups.map((group) => <button aria-selected={group.id === selectedGroupId}
        className={group.id === selectedGroupId ? "is-selected" : ""} key={group.id}
        onClick={() => onSelect(group.id)} role="treeitem" style={{ "--tree-indent": `${group.depth * 18}px` } as CSSProperties} type="button">
        <span className={`organization-tree__status is-${group.status}`} />
        <span><strong>{group.name}</strong><small>{groupTypeLabel(group.type)} · {group.id}</small></span>
      </button>)}
      {visibleGroups.length === 0 ? <p>조건에 맞는 그룹이 없습니다.</p> : null}
    </div>
  </aside>;
}

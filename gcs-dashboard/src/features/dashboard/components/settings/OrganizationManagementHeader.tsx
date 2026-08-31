import type { ManagedGroup } from "@dashboard/groups/managedGroups";
import { groupTypeLabel } from "@dashboard/groups/organizationHierarchy";

export type OrganizationDetailTab = "overview" | "members";

export function OrganizationManagementHeader({ group, parentName, activeTab, onTabChange }: {
  group: ManagedGroup; parentName?: string; activeTab: OrganizationDetailTab; onTabChange: (tab: OrganizationDetailTab) => void;
}) {
  return <header className="organization-detail__header">
    <div><span>{parentName ? `${parentName} > ` : ""}{groupTypeLabel(group.type)}</span>
      <strong>{group.name}</strong><small>그룹 ID · {group.id}</small></div>
    <em className={`is-${group.status}`}>{group.status === "active" ? "활성" : "비활성"}</em>
    <nav aria-label="선택 그룹 관리 탭">
      <button aria-pressed={activeTab === "overview"} onClick={() => onTabChange("overview")} type="button">개요</button>
      <button aria-pressed={activeTab === "members"} onClick={() => onTabChange("members")} type="button">회원</button>
    </nav>
  </header>;
}

import { useState } from "react";
import type { ManagedGroup } from "@dashboard/groups/managedGroups";
import { useOrganizationDirectory } from "@dashboard/hooks/groups/useOrganizationDirectory";
import { useOrganizationMembers } from "@dashboard/hooks/groups/useOrganizationMembers";
import { OrganizationCreateGroupForm } from "./OrganizationCreateGroupForm";
import { OrganizationGroupOverview } from "./OrganizationGroupOverview";
import { OrganizationGroupTree } from "./OrganizationGroupTree";
import { OrganizationManagementHeader, type OrganizationDetailTab } from "./OrganizationManagementHeader";
import { OrganizationMemberManagement } from "./OrganizationMemberManagement";

export function OrganizationAccessManagement() {
  const directory = useOrganizationDirectory();
  const memberState = useOrganizationMembers(directory.selectedGroup?.id);
  const [activeTab, setActiveTab] = useState<OrganizationDetailTab>("overview");
  const [isCreating, setIsCreating] = useState(false);
  const [viewError, setViewError] = useState("");
  const selectGroup = (groupId: string): void => { directory.selectGroup(groupId); setActiveTab("overview"); };
  const groupChanged = async (): Promise<void> => {
    await directory.refresh(directory.selectedGroup?.id); await memberState.refresh();
  };
  const groupCreated = async (group: ManagedGroup): Promise<void> => {
    setIsCreating(false); await directory.refresh(group.id); setActiveTab("overview");
  };
  const error = viewError || directory.error || memberState.error;

  return <section className="organization-management" aria-label="조직 및 권한 관리">
    <OrganizationGroupTree groups={directory.groups} onCreate={() => setIsCreating(true)}
      onSelect={selectGroup} selectedGroupId={directory.selectedGroup?.id ?? ""} />
    <main className="organization-detail">
      {isCreating ? <OrganizationCreateGroupForm groups={directory.groups} onCancel={() => setIsCreating(false)}
        onCreated={groupCreated} onError={setViewError}
        parentId={directory.selectedGroup?.status === "active" ? directory.selectedGroup.id : null} />
        : directory.selectedGroup ? <OrganizationGroupContent activeTab={activeTab} directory={directory}
          groupChanged={groupChanged} memberState={memberState} onError={setViewError} onTabChange={setActiveTab} />
          : <p>등록된 그룹이 없습니다. 새 그룹을 생성하세요.</p>}
      {error ? <p className="time-sync-view__error" role="alert">{error}</p> : null}
    </main>
  </section>;
}

function OrganizationGroupContent({ activeTab, directory, groupChanged, memberState, onError, onTabChange }: {
  activeTab: OrganizationDetailTab; directory: ReturnType<typeof useOrganizationDirectory>;
  groupChanged: () => Promise<void>; memberState: ReturnType<typeof useOrganizationMembers>;
  onError: (message: string) => void; onTabChange: (tab: OrganizationDetailTab) => void;
}) {
  const group = directory.selectedGroup!;
  const parentName = directory.groups.find((candidate) => candidate.id === group.parentId)?.name;
  return <><OrganizationManagementHeader activeTab={activeTab} group={group} onTabChange={onTabChange} parentName={parentName} />
    {activeTab === "overview" ? <OrganizationGroupOverview group={group} groups={directory.groups} key={group.id}
      members={memberState.members} onAppoint={memberState.appoint} onChanged={groupChanged}
      onError={onError} onRefreshMembers={memberState.refresh} />
      : <OrganizationMemberManagement group={group} members={memberState.members} onAppoint={memberState.appoint}
        onRefresh={memberState.refresh} onUpdate={memberState.mutate} />}</>;
}

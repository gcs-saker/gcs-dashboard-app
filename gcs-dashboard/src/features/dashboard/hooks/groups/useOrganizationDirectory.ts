import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchManagedGroups } from "@dashboard/groups/managedGroupApi";
import type { ManagedGroup } from "@dashboard/groups/managedGroups";

export function useOrganizationDirectory() {
  const [groups, setGroups] = useState<ManagedGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [error, setError] = useState("");
  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? groups[0],
    [groups, selectedGroupId],
  );
  const refresh = useCallback(async (preferredGroupId?: string): Promise<void> => {
    try {
      const records = await fetchManagedGroups();
      setGroups(records);
      setSelectedGroupId((current) => preferredGroupId ?? validSelection(records, current));
      setError("");
    } catch (reason) { setError(toErrorMessage(reason, "그룹을 불러오지 못했습니다.")); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { error, groups, refresh, selectedGroup, selectGroup: setSelectedGroupId };
}

function validSelection(groups: ManagedGroup[], current: string): string {
  return groups.some((group) => group.id === current) ? current : groups[0]?.id ?? "";
}

export function toErrorMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

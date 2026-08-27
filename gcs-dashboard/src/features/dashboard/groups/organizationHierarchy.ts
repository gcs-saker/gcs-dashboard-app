import type { ManagedGroup } from "./managedGroups";

export interface HierarchyGroup extends ManagedGroup {
  depth: number;
}

export function flattenGroupHierarchy(groups: readonly ManagedGroup[]): HierarchyGroup[] {
  const children = new Map<string | null, ManagedGroup[]>();
  groups.forEach((group) => {
    const parentKey = groups.some((candidate) => candidate.id === group.parentId) ? group.parentId : null;
    children.set(parentKey, [...(children.get(parentKey) ?? []), group]);
  });
  const result: HierarchyGroup[] = [];
  const append = (parentId: string | null, depth: number): void => {
    (children.get(parentId) ?? []).forEach((group) => {
        result.push({ ...group, depth });
        append(group.id, depth + 1);
      });
  };
  append(null, 0);
  return result;
}

export const groupTypeLabel = (type: ManagedGroup["type"]): string => ({
  battalion: "대대", company: "중대", platoon: "소대", squad: "분대",
})[type];

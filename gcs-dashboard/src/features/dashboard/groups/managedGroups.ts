export interface ManagedGroup {
  id: string;
  name: string;
  type: "battalion" | "company" | "platoon" | "squad";
  parentId: string | null;
  status: "active" | "inactive";
}

export function isManagedGroup(value: unknown): value is ManagedGroup {
  if (!value || typeof value !== "object") return false;
  const group = value as Partial<ManagedGroup>;
  return typeof group.id === "string" && typeof group.name === "string" &&
    ["battalion", "company", "platoon", "squad"].includes(group.type ?? "") &&
    (group.parentId === null || typeof group.parentId === "string") &&
    (group.status === "active" || group.status === "inactive");
}

export const isManagedGroupList = (value: unknown): value is ManagedGroup[] =>
  Array.isArray(value) && value.every(isManagedGroup);

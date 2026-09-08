export type ManagedMemberRole = "viewer" | "operator" | "group_admin";

export interface GroupMember {
  username: string;
  email: string;
  role: ManagedMemberRole;
  groupId: string;
  active: boolean;
  securityVersion: number;
}

export interface GroupMemberUpdate {
  role?: "viewer" | "operator";
  active?: boolean;
  password?: string;
}

export function isGroupMember(value: unknown): value is GroupMember {
  if (!value || typeof value !== "object") return false;
  const member = value as Partial<GroupMember>;
  return typeof member.username === "string" && typeof member.email === "string" &&
    (member.role === "viewer" || member.role === "operator" || member.role === "group_admin") &&
    typeof member.groupId === "string" && typeof member.active === "boolean" &&
    typeof member.securityVersion === "number";
}

export const isGroupMemberList = (value: unknown): value is GroupMember[] =>
  Array.isArray(value) && value.every(isGroupMember);

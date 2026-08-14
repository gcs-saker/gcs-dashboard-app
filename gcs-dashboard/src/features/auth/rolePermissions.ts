import type { UserRole } from "./types";

export function canManageDeviceProvisioning(role: UserRole | undefined): boolean {
  return role === "admin" || role === "group_admin";
}

export interface AccessibleGroup {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
}

export interface AccessibleGroupDevice {
  deviceUuid: string;
  groupId: string;
  displayName: string;
  deviceType: string;
  status: "active" | "pending" | "disabled";
  streamPaths: string[];
}

export interface AccessibleGroupInventory {
  groups: AccessibleGroup[];
  devices: AccessibleGroupDevice[];
}

export function isAccessibleGroupList(payload: unknown): payload is AccessibleGroup[] {
  return Array.isArray(payload) && payload.every((item) => {
    if (!item || typeof item !== "object") return false;
    const group = item as Partial<AccessibleGroup>;
    return typeof group.id === "string" && typeof group.name === "string" &&
      typeof group.type === "string" && (group.parentId === null || typeof group.parentId === "string");
  });
}

export function isAccessibleGroupDeviceList(payload: unknown): payload is AccessibleGroupDevice[] {
  return Array.isArray(payload) && payload.every((item) => {
    if (!item || typeof item !== "object") return false;
    const device = item as Partial<AccessibleGroupDevice>;
    return typeof device.deviceUuid === "string" && typeof device.groupId === "string" &&
      typeof device.displayName === "string" && typeof device.deviceType === "string" &&
      isDeviceStatus(device.status) && Array.isArray(device.streamPaths) &&
      device.streamPaths.every((path) => typeof path === "string");
  });
}

function isDeviceStatus(status: unknown): status is AccessibleGroupDevice["status"] {
  return status === "active" || status === "pending" || status === "disabled";
}

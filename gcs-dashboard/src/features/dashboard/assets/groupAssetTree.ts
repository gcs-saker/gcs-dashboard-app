import type { AssetTreeNode, AssetTreeStatus, AssetTreeStreamSource } from "@dashboard/assets/assetTree";
import type { AccessibleGroup, AccessibleGroupDevice, AccessibleGroupInventory } from "@dashboard/assets/groupAssetContracts";

export function buildAccessibleAssetTree(inventory: AccessibleGroupInventory, streams: AssetTreeStreamSource[]): AssetTreeNode {
  const streamsByPath = new Map(streams.flatMap((stream) => stream.streamPath ? [[stream.streamPath, stream] as const] : []));
  const devicesByGroup = groupItems(inventory.devices, (device) => device.groupId);
  const groupsByParent = groupItems(inventory.groups, (group) => group.parentId);
  const buildGroup = (group: AccessibleGroup): AssetTreeNode => {
    const children = [
      ...(groupsByParent.get(group.id) ?? []).map(buildGroup),
      ...(devicesByGroup.get(group.id) ?? []).map((device) => deviceNode(device, streamsByPath)),
    ];
    return { id: group.id, label: group.name, type: "group", status: aggregateStatus(children), children };
  };
  const knownIds = new Set(inventory.groups.map((group) => group.id));
  const rootGroups = inventory.groups.filter((group) => group.parentId === null || !knownIds.has(group.parentId));
  const children = rootGroups.map(buildGroup);
  return { id: "accessible-assets", label: "접근 가능 자산", type: "root", status: aggregateStatus(children), children };
}

function groupItems<T, K>(items: T[], keyOf: (item: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  items.forEach((item) => grouped.set(keyOf(item), [...(grouped.get(keyOf(item)) ?? []), item]));
  return grouped;
}

function deviceNode(device: AccessibleGroupDevice, streamsByPath: Map<string, AssetTreeStreamSource>): AssetTreeNode {
  const children = device.streamPaths.map((path) => {
    const runtime = streamsByPath.get(path);
    return { id: path, label: runtime ? streamLabel(runtime) : path, type: "stream" as const, status: runtime ? streamStatus(runtime.status) : "offline" as const };
  });
  const status: AssetTreeStatus = device.status === "active" ? (children.length ? aggregateStatus(children) : "online") : device.status === "pending" ? "warning" : "offline";
  return { id: device.deviceUuid, label: device.displayName, detail: device.deviceType, type: "device", status, children };
}

function streamStatus(status: AssetTreeStreamSource["status"]): AssetTreeStatus {
  if (status === "online") return "online";
  if (status === "offline" || status === "error") return "offline";
  return "warning";
}

function streamLabel(source: AssetTreeStreamSource): string {
  return source.detail.split(" / ")[0].trim() || source.streamPath || "스트림";
}

function aggregateStatus(children: AssetTreeNode[]): AssetTreeStatus {
  if (!children.length || children.every((child) => child.status === "offline")) return "offline";
  if (children.every((child) => child.status === "online")) return "online";
  return "warning";
}

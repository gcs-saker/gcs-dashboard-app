import type { AssetTreeNode, AssetTreeStatus, AssetTreeStreamSource } from "@dashboard/assets/assetTree";
import type { AccessibleGroup, AccessibleGroupDevice, AccessibleGroupInventory } from "@dashboard/assets/groupAssetContracts";
import type { StreamDeviceAliases } from "@dashboard/preferences/streamPreferences";

export function buildAccessibleAssetTree(
  inventory: AccessibleGroupInventory,
  streams: AssetTreeStreamSource[],
  aliases: StreamDeviceAliases = {},
): AssetTreeNode {
  const streamsByPath = new Map(streams.flatMap((stream) => stream.streamPath ? [[stream.streamPath, stream] as const] : []));
  const devicesByGroup = groupItems(inventory.devices, (device) => device.groupId);
  const groupsByParent = groupItems(inventory.groups, (group) => group.parentId);
  const buildGroup = (group: AccessibleGroup): AssetTreeNode => {
    const children = [
      ...(groupsByParent.get(group.id) ?? []).map(buildGroup),
      ...(devicesByGroup.get(group.id) ?? []).map((device) => deviceNode(device, streamsByPath, aliases)),
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

function deviceNode(
  device: AccessibleGroupDevice,
  streamsByPath: Map<string, AssetTreeStreamSource>,
  aliases: StreamDeviceAliases,
): AssetTreeNode {
  const streamStatuses = device.streamPaths.map((path) => {
    const runtime = streamsByPath.get(path);
    return runtime ? streamStatus(runtime.status) : "offline";
  });
  const status = deviceStatus(device, streamStatuses);
  return {
    id: device.deviceUuid,
    label: aliases[device.deviceUuid]?.trim() || device.displayName,
    detail: device.deviceType,
    type: "device",
    status,
  };
}

function deviceStatus(device: AccessibleGroupDevice, streamStatuses: AssetTreeStatus[]): AssetTreeStatus {
  if (device.status === "pending") return "warning";
  if (device.status !== "active") return "offline";
  return streamStatuses.length ? aggregateStatuses(streamStatuses) : "online";
}

function streamStatus(status: AssetTreeStreamSource["status"]): AssetTreeStatus {
  if (status === "online") return "online";
  if (status === "offline" || status === "error") return "offline";
  return "warning";
}

function aggregateStatuses(statuses: AssetTreeStatus[]): AssetTreeStatus {
  if (statuses.every((status) => status === "offline")) return "offline";
  if (statuses.every((status) => status === "online")) return "online";
  return "warning";
}

function aggregateStatus(children: AssetTreeNode[]): AssetTreeStatus {
  if (!children.length || children.every((child) => child.status === "offline")) return "offline";
  if (children.every((child) => child.status === "online")) return "online";
  return "warning";
}

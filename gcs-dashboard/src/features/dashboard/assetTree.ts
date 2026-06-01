export type AssetTreeStatus = "online" | "warning" | "offline";
export type AssetTreeNodeType = "root" | "group" | "device" | "stream" | "sensor";

export interface AssetTreeNode {
  id: string;
  label: string;
  type: AssetTreeNodeType;
  status: AssetTreeStatus;
  children?: AssetTreeNode[];
}

export const DEFAULT_ASSET_TREE: AssetTreeNode = {
  id: "gcs-saker",
  label: "GCS-SAKER",
  type: "root",
  status: "online",
  children: [
    {
      id: "group-drone",
      label: "드론",
      type: "group",
      status: "online",
      children: [
        {
          id: "DRN-01",
          label: "DRN-01",
          type: "device",
          status: "online",
          children: [{ id: "raw.sample.front", label: "전방 EO", type: "stream", status: "online" }],
        },
        {
          id: "DRN-02",
          label: "DRN-02",
          type: "device",
          status: "online",
          children: [{ id: "raw.sample.thermal", label: "열화상", type: "stream", status: "warning" }],
        },
      ],
    },
    {
      id: "group-ugv",
      label: "지상로봇",
      type: "group",
      status: "warning",
      children: [
        {
          id: "UGV-01",
          label: "UGV-01",
          type: "device",
          status: "online",
          children: [{ id: "raw.sample.rear", label: "후방 AI", type: "stream", status: "online" }],
        },
        { id: "UGV-02", label: "UGV-02", type: "device", status: "warning" },
      ],
    },
    {
      id: "group-sensor",
      label: "센서",
      type: "group",
      status: "warning",
      children: [
        { id: "SEN-01", label: "SEN-01", type: "sensor", status: "online" },
        { id: "SEN-04", label: "SEN-04", type: "sensor", status: "offline" },
      ],
    },
  ],
};

export function getAssetTreeStatusText(status: AssetTreeStatus): string {
  switch (status) {
    case "online":
      return "정상";
    case "warning":
      return "주의";
    case "offline":
      return "오프라인";
  }
}

export function collectAssetTreeNodes(root: AssetTreeNode): AssetTreeNode[] {
  return [root, ...(root.children ?? []).flatMap((child) => collectAssetTreeNodes(child))];
}

export interface AssetTreeStreamSource {
  streamPath?: string | null;
  detail: string;
  status: "online" | "fallback" | "offline" | "error" | "reconnecting" | "degraded";
}

function statusFromStream(status: AssetTreeStreamSource["status"]): AssetTreeStatus {
  switch (status) {
    case "online":
      return "online";
    case "offline":
    case "error":
      return "offline";
    case "fallback":
    case "reconnecting":
    case "degraded":
      return "warning";
  }
}

function assetIdFromStreamPath(streamPath: string): string {
  const [, assetId = "unknown"] = streamPath.split(".");
  return assetId.toUpperCase();
}

function streamLabelFromDetail(source: AssetTreeStreamSource): string {
  const [name] = source.detail.split(" / ");
  return name.trim() || source.streamPath || "스트림";
}

function aggregateStatus(children: AssetTreeNode[]): AssetTreeStatus {
  if (children.length === 0) return "offline";
  if (children.every((child) => child.status === "online")) return "online";
  if (children.every((child) => child.status === "offline")) return "offline";
  return "warning";
}

function syncKnownStreamStatuses(
  node: AssetTreeNode,
  streamsByPath: Map<string, AssetTreeStreamSource>,
): AssetTreeNode {
  const runtimeStream = streamsByPath.get(node.id);
  const children = node.children
    ?.filter((child) => child.id !== "group-discovered-streams")
    .map((child) => syncKnownStreamStatuses(child, streamsByPath));

  if (runtimeStream && node.type === "stream") {
    return {
      ...node,
      status: statusFromStream(runtimeStream.status),
      children,
    };
  }

  return {
    ...node,
    status: children?.length ? aggregateStatus(children) : node.status,
    children,
  };
}

export function mergeAssetTreeWithStreams(
  root: AssetTreeNode,
  streams: AssetTreeStreamSource[],
): AssetTreeNode {
  const liveStreams = streams.filter((stream): stream is AssetTreeStreamSource & { streamPath: string } =>
    Boolean(stream.streamPath),
  );
  const streamsByPath = new Map<string, AssetTreeStreamSource>(
    liveStreams.map((stream) => [stream.streamPath, stream]),
  );
  const syncedRoot = syncKnownStreamStatuses(root, streamsByPath);
  const knownNodeIds = new Set(collectAssetTreeNodes(syncedRoot).map((node) => node.id));
  const discoveredByAsset = new Map<string, AssetTreeNode[]>();

  for (const stream of liveStreams) {
    if (knownNodeIds.has(stream.streamPath)) continue;
    const assetId = assetIdFromStreamPath(stream.streamPath);
    const streamNode: AssetTreeNode = {
      id: stream.streamPath,
      label: streamLabelFromDetail(stream),
      type: "stream",
      status: statusFromStream(stream.status),
    };
    discoveredByAsset.set(assetId, [...(discoveredByAsset.get(assetId) ?? []), streamNode]);
  }

  if (!discoveredByAsset.size) return syncedRoot;

  const discoveredGroup: AssetTreeNode = {
    id: "group-discovered-streams",
    label: "감지 스트림",
    type: "group",
    status: aggregateStatus(Array.from(discoveredByAsset.values()).flat()),
    children: Array.from(discoveredByAsset.entries()).map(([assetId, children]) => ({
      id: `asset-${assetId.toLowerCase()}`,
      label: assetId,
      type: "device",
      status: aggregateStatus(children),
      children,
    })),
  };

  return {
    ...syncedRoot,
    children: [...(syncedRoot.children ?? []).filter((child) => child.id !== discoveredGroup.id), discoveredGroup],
  };
}
